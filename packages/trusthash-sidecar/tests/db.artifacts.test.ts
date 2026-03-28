import { afterEach, describe, expect, it } from 'vitest';
import { Database } from 'duckdb-async';
import { runMigrations } from '../src/db/migrations.js';
import { replaceSoftBindings, upsertManifestArtifact } from '../src/db/index.js';

const opened: Database[] = [];

async function createTestDb(): Promise<Database> {
  const db = await Database.create(':memory:');
  opened.push(db);
  await runMigrations(db);
  return db;
}

afterEach(async () => {
  while (opened.length > 0) {
    const db = opened.pop();
    await db?.close();
  }
});

describe('db schema and artifact upsert', () => {
  it('creates artifact columns and nullable phash in manifests schema', async () => {
    const db = await createTestDb();
    const columns = (await db.all(`PRAGMA table_info('manifests')`)) as Array<{
      name: string;
      notnull: number;
    }>;

    const names = new Set(columns.map((column) => column.name));

    expect(names.has('artifact_kind')).toBe(true);
    expect(names.has('remote_manifest_url')).toBe(true);
    expect(names.has('manifest_digest_alg')).toBe(true);
    expect(names.has('manifest_digest_b64')).toBe(true);
    expect(names.has('repo_url')).toBe(true);
    expect(names.has('fetch_url')).toBe(true);

    const phashColumn = columns.find((column) => column.name === 'phash');
    expect(phashColumn).toBeDefined();
    expect(Number(phashColumn?.notnull ?? 1)).toBe(0);
  });

  it('upserts artifacts by manifest_id and replaces the row metadata', async () => {
    const db = await createTestDb();

    await upsertManifestArtifact(
      {
        manifestTxId: 'tx-1',
        manifestId: 'urn:uuid:test-artifact',
        artifactKind: 'manifest-store',
        originalHash: null,
        contentType: 'application/c2pa',
        phash: new Array(64).fill(0),
        hasPriorManifest: false,
        claimGenerator: 'test',
        ownerAddress: 'owner-1',
      },
      { database: db }
    );

    await replaceSoftBindings(
      'urn:uuid:test-artifact',
      [{ alg: 'org.ar-io.phash', valueB64: 'AAAAAAAAAAA=' }],
      { database: db }
    );

    await upsertManifestArtifact(
      {
        manifestTxId: 'tx-2',
        manifestId: 'urn:uuid:test-artifact',
        artifactKind: 'proof-locator',
        remoteManifestUrl: 'https://example.com/proof.c2pa',
        manifestDigestAlg: 'sha256',
        manifestDigestB64: Buffer.from('digest').toString('base64'),
        originalHash: null,
        contentType: 'application/c2pa',
        phash: null,
        hasPriorManifest: false,
        claimGenerator: 'test',
        ownerAddress: 'owner-1',
      },
      { database: db }
    );

    const rows = (await db.all(
      `SELECT manifest_tx_id, artifact_kind, remote_manifest_url, phash
       FROM manifests
       WHERE manifest_id = ?`,
      'urn:uuid:test-artifact'
    )) as Array<{
      manifest_tx_id: string;
      artifact_kind: string;
      remote_manifest_url: string | null;
      phash: string | null;
    }>;

    expect(rows.length).toBe(1);
    expect(rows[0].manifest_tx_id).toBe('tx-2');
    expect(rows[0].artifact_kind).toBe('proof-locator');
    expect(rows[0].remote_manifest_url).toBe('https://example.com/proof.c2pa');
    expect(rows[0].phash).toBeNull();
  });
});
