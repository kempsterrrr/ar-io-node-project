import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { Database, OPEN_READONLY } from 'duckdb-async';
import sharp from 'sharp';
import { SOFT_BINDING_ALG_ID } from '../src/services/softbinding.service.js';

const runIntegration = process.env.RUN_INTEGRATION === '1';
const describeIntegration = runIntegration ? describe : describe.skip;

const baseUrlEnv = process.env.INTEGRATION_BASE_URL;
const dbPath = process.env.INTEGRATION_DB_PATH || './data-test/provenance.test.duckdb';
const referenceUrl = process.env.REFERENCE_TEST_URL || 'http://gateway-stub/reference.png';
const referenceFile = process.env.REFERENCE_TEST_FILE;
const seededManifestId =
  process.env.INTEGRATION_MANIFEST_ID || 'urn:uuid:00000000-0000-0000-0000-000000000000';
const seededManifestTxId = process.env.INTEGRATION_MANIFEST_TX_ID || 'test-tx-0001';
const fallbackManifestId =
  process.env.INTEGRATION_FALLBACK_MANIFEST_ID || 'urn:uuid:00000000-0000-0000-0000-000000000002';

type SampleBinding = {
  manifestId: string;
  manifestTxId: string;
  alg: string;
  valueB64: string;
};

let db: Database;
let sampleBinding: SampleBinding;
let baseUrl = baseUrlEnv || '';

function detectContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function resolveReferenceMetadata(): Promise<{ assetLength: number; assetType: string }> {
  if (referenceFile) {
    const refBuffer = readFileSync(referenceFile);
    return {
      assetLength: refBuffer.length,
      assetType: detectContentType(referenceFile),
    };
  }

  const refResponse = await fetch(referenceUrl);
  if (!refResponse.ok) {
    throw new Error(`Failed to fetch reference URL (${referenceUrl}): ${refResponse.status}`);
  }

  const refBuffer = Buffer.from(await refResponse.arrayBuffer());
  return {
    assetLength: refBuffer.length,
    assetType: refResponse.headers.get('content-type')?.split(';')[0] || 'application/octet-stream',
  };
}

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

    db = await Database.create(dbPath, OPEN_READONLY);

    const rows = (await db.all(
      `SELECT sb.manifest_id, m.manifest_tx_id, sb.alg, sb.value_b64
       FROM soft_bindings sb
       JOIN manifests m ON m.manifest_id = sb.manifest_id
       WHERE m.manifest_id = ?
       LIMIT 1`
      ,
      seededManifestId
    )) as Array<{
      manifest_id: string;
      manifest_tx_id: string;
      alg: string;
      value_b64: string;
    }>;

    if (!rows.length) {
      throw new Error(
        'No soft binding data found in DuckDB. Seed the integration DB first (for example with ./scripts/run-trusthash-integration.sh).'
      );
    }

    const row = rows[0];
    sampleBinding = {
      manifestId: row.manifest_id,
      manifestTxId: row.manifest_tx_id,
      alg: row.alg || SOFT_BINDING_ALG_ID,
      valueB64: row.value_b64,
    };
  });

  afterAll(async () => {
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
    const body = JSON.parse(bodyText) as {
      matches: Array<{ manifestId: string }>;
      manifestResults: Array<{ manifestId: string }>;
    };
    expect(Array.isArray(body.matches)).toBe(true);
    expect(Array.isArray(body.manifestResults)).toBe(true);
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

  it('rejects hintValue without hintAlg for /v1/matches/byContent', async () => {
    const imageBuffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .png()
      .toBuffer();

    const response = await fetch(
      `${baseUrl}/v1/matches/byContent?alg=org.ar-io.phash&hintValue=${encodeURIComponent(sampleBinding.valueB64)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': imageBuffer.length.toString(),
        },
        body: imageBuffer,
      }
    );

    const status = response.status;
    const bodyText = await response.text();
    expect(status).toBe(400);
    const body = JSON.parse(bodyText) as { error?: string };
    expect(body.error).toContain('hintValue requires hintAlg');
  });

  it('returns 501 for /v1/matches/byReference', async () => {
    const { assetLength } = await resolveReferenceMetadata();
    const response = await fetch(`${baseUrl}/v1/matches/byReference`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        referenceUrl,
        assetLength,
      }),
    });

    const status = response.status;
    const bodyText = await response.text();
    expect(status).toBe(501);
    const body = JSON.parse(bodyText) as { error?: string };
    expect(body.error).toContain('byReference not implemented yet');
  });

  it('indexes webhook payloads using C2PA tag aliases', async () => {
    const aliasTxId = `alias-${Date.now()}`;
    const aliasManifestId = `urn:uuid:alias-${Date.now()}`;

    const webhookResponse = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_id: aliasTxId,
        tags: [
          { name: 'Content-Type', value: 'application/c2pa' },
          { name: 'Manifest-Type', value: 'sidecar' },
          { name: 'C2PA-Manifest-ID', value: aliasManifestId },
          { name: 'C2PA-Soft-Binding-Alg', value: sampleBinding.alg },
          { name: 'C2PA-Soft-Binding-Value', value: sampleBinding.valueB64 },
          { name: 'pHash', value: '0000000000000000' },
        ],
        owner: 'integration-alias-owner',
        block_height: 2,
        block_timestamp: 1700000001,
      }),
    });
    const webhookStatus = webhookResponse.status;
    const webhookBodyText = await webhookResponse.text();
    expect(webhookStatus).toBe(200);
    const webhookBody = JSON.parse(webhookBodyText) as {
      success: boolean;
      data?: { action?: string };
    };
    expect(webhookBody.success).toBe(true);
    expect(webhookBody.data?.action).toBe('indexed');

    const replayResponse = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_id: aliasTxId,
        tags: [
          { name: 'Content-Type', value: 'application/c2pa' },
          { name: 'Manifest-Type', value: 'sidecar' },
          { name: 'C2PA-Manifest-ID', value: aliasManifestId },
          { name: 'C2PA-Soft-Binding-Alg', value: sampleBinding.alg },
          { name: 'C2PA-Soft-Binding-Value', value: sampleBinding.valueB64 },
          { name: 'pHash', value: '0000000000000000' },
        ],
        owner: 'integration-alias-owner',
        block_height: 2,
        block_timestamp: 1700000001,
      }),
    });
    expect(replayResponse.status).toBe(200);
    const replayBodyText = await replayResponse.text();
    const replayBody = JSON.parse(replayBodyText) as {
      success: boolean;
      data?: { action?: string; reason?: string };
    };
    expect(replayBody.success).toBe(true);
    expect(replayBody.data?.action).toBe('skipped');
    expect(replayBody.data?.reason).toContain('Already indexed');
  });

  it('redirects /v1/manifests/:manifestId using fetch URL metadata', async () => {
    const response = await fetch(
      `${baseUrl}/v1/manifests/${encodeURIComponent(seededManifestId)}`,
      {
        redirect: 'manual',
      }
    );
    const status = response.status;
    expect(status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBe(`http://gateway-stub/${seededManifestTxId}`);
  });

  it('honors returnActiveManifest=false on /v1/manifests/:manifestId with redirect behavior', async () => {
    const response = await fetch(
      `${baseUrl}/v1/manifests/${encodeURIComponent(seededManifestId)}?returnActiveManifest=false`,
      {
        redirect: 'manual',
      }
    );
    const status = response.status;
    expect(status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBe(`http://gateway-stub/${seededManifestTxId}`);
  });

  it('falls back to local manifest-store bytes when no redirect tags exist', async () => {
    const response = await fetch(
      `${baseUrl}/v1/manifests/${encodeURIComponent(fallbackManifestId)}?returnActiveManifest=false`
    );
    const status = response.status;
    const bodyText = await response.text();
    expect(status).toBe(200);
    expect(bodyText.length).toBeGreaterThan(0);
    expect(response.headers.get('x-manifest-resolution')).toBe('fallback-manifest-store');
  });

  it('returns 501 for returnActiveManifest=true on /v1/manifests/:manifestId', async () => {
    const response = await fetch(
      `${baseUrl}/v1/manifests/${encodeURIComponent(sampleBinding.manifestId)}?returnActiveManifest=true`
    );
    const status = response.status;
    const bodyText = await response.text();
    expect(status).toBe(501);
    const body = JSON.parse(bodyText) as { error?: string };
    expect(body.error).toContain('returnActiveManifest not implemented yet');
  });
});
