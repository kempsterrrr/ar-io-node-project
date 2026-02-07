import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { Database } from 'duckdb-async';
import sharp from 'sharp';
import { binaryStringToHex, floatArrayToBinaryString } from '../src/utils/bit-vector.js';
import {
  SOFT_BINDING_ALG_ID,
  pHashHexToSoftBindingValue,
} from '../src/services/softbinding.service.js';

const runIntegration = process.env.RUN_INTEGRATION === '1';
const describeIntegration = runIntegration ? describe : describe.skip;

const baseUrlEnv = process.env.INTEGRATION_BASE_URL;
const dbPath = process.env.INTEGRATION_DB_PATH || './data/provenance.duckdb';
const referenceUrl = process.env.REFERENCE_TEST_URL || 'https://httpbin.org/image/png';

type SampleBinding = {
  manifestId: string;
  manifestTxId: string;
  alg: string;
  valueB64: string;
};

let db: Database;
let sampleBinding: SampleBinding;
let insertedBinding: SampleBinding | null = null;
let baseUrl = baseUrlEnv || '';

async function resolveBaseUrl(): Promise<string> {
  if (baseUrlEnv) {
    return baseUrlEnv;
  }

  const candidates = ['http://localhost:3003', 'http://trusthash-sidecar:3003'];
  for (const candidate of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      try {
        const res = await fetch(`${candidate}/health`, { signal: controller.signal });
        if (res.ok) {
          return candidate;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    'Unable to reach sidecar. Set INTEGRATION_BASE_URL (e.g. http://localhost:3003).'
  );
}

describeIntegration('integration', () => {
  beforeAll(async () => {
    baseUrl = await resolveBaseUrl();

    db = await Database.create(dbPath);

    const rows = (await db.all(
      `SELECT manifest_id, manifest_tx_id, phash
       FROM manifests
       WHERE manifest_id IS NOT NULL
       LIMIT 1`
    )) as Array<{
      manifest_id: string;
      manifest_tx_id: string;
      phash: unknown;
    }>;

    if (!rows.length) {
      throw new Error(
        'No manifest data found in DuckDB. Ensure the sidecar has indexed manifests before running integration tests.'
      );
    }

    const row = rows[0];
    let phash: number[] = [];
    if (typeof row.phash === 'string') {
      phash = JSON.parse(row.phash) as number[];
    } else if (Array.isArray(row.phash)) {
      phash = row.phash as number[];
    }

    if (!phash.length) {
      throw new Error('Manifest record is missing pHash data.');
    }

    const binary = floatArrayToBinaryString(phash);
    const hex = binaryStringToHex(binary);
    const valueB64 = pHashHexToSoftBindingValue(hex);

    await db.run(
      `INSERT INTO soft_bindings (manifest_id, alg, value_b64, scope_json)
       VALUES (?, ?, ?, ?)`,
      row.manifest_id,
      SOFT_BINDING_ALG_ID,
      valueB64,
      null
    );

    insertedBinding = {
      manifestId: row.manifest_id,
      manifestTxId: row.manifest_tx_id,
      alg: SOFT_BINDING_ALG_ID,
      valueB64,
    };

    sampleBinding = insertedBinding;
  });

  afterAll(async () => {
    if (insertedBinding) {
      await db.run(
        `DELETE FROM soft_bindings WHERE manifest_id = ? AND alg = ? AND value_b64 = ?`,
        insertedBinding.manifestId,
        insertedBinding.alg,
        insertedBinding.valueB64
      );
    }
    await db?.close();
  });

  it('hits /v1/matches/byBinding with real binding data', async () => {
    const url = new URL(`${baseUrl}/v1/matches/byBinding`);
    url.searchParams.set('alg', sampleBinding.alg);
    url.searchParams.set('value', sampleBinding.valueB64);
    url.searchParams.set('maxResults', '10');
    const response = await fetch(url.toString());
    const status = response.status;
    const bodyText = await response.text();
    expect(status).toBe(200);
    const body = JSON.parse(bodyText) as { matches: Array<{ manifestId: string }> };
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.matches.some((m) => m.manifestId === sampleBinding.manifestId)).toBe(true);
  });

  it('hits /v1/matches/byContent with real image data', async () => {
    const imageBuffer = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 128, g: 64, b: 32 },
      },
    })
      .png()
      .toBuffer();

    const response = await fetch(`${baseUrl}/v1/matches/byContent?alg=org.ar-io.phash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.length.toString(),
      },
      body: imageBuffer,
    });
    const status = response.status;
    const bodyText = await response.text();

    expect(status).toBe(200);
    const body = JSON.parse(bodyText) as { matches: unknown[] };
    expect(Array.isArray(body.matches)).toBe(true);
  });

  it('hits /v1/matches/byReference with a real reference URL', async () => {
    const refResponse = await fetch(referenceUrl);
    if (!refResponse.ok) {
      throw new Error(`Failed to fetch reference URL (${referenceUrl}): ${refResponse.status}`);
    }

    const refBuffer = Buffer.from(await refResponse.arrayBuffer());
    const assetLength = refBuffer.length;
    const assetType =
      refResponse.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';

    if (!assetType.startsWith('image/')) {
      throw new Error(`Reference URL did not return an image: ${assetType}`);
    }

    const response = await fetch(`${baseUrl}/v1/matches/byReference`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        referenceUrl,
        assetLength,
        assetType,
      }),
    });

    const status = response.status;
    const bodyText = await response.text();
    expect(status).toBe(200);
    const body = JSON.parse(bodyText) as { matches: unknown[] };
    expect(Array.isArray(body.matches)).toBe(true);
  });

  it('hits /v1/manifests/:manifestId with real data', async () => {
    const response = await fetch(
      `${baseUrl}/v1/manifests/${encodeURIComponent(sampleBinding.manifestId)}`
    );
    const status = response.status;
    const bodyText = await response.text();
    expect(status).toBe(200);
    expect(bodyText.length).toBeGreaterThan(0);
  });
});
