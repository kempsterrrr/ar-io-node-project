import { Database } from 'duckdb-async';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { runMigrations } from './migrations.js';

let db: Database | null = null;

function requireDatabase(database?: Database | null): Database {
  const resolved = database ?? getDatabase();
  if (!resolved) {
    throw new Error('Database not initialized');
  }
  return resolved;
}

async function runInTransaction<T>(database: Database, fn: () => Promise<T>): Promise<T> {
  await database.run('BEGIN TRANSACTION');
  try {
    const result = await fn();
    await database.run('COMMIT');
    return result;
  } catch (error) {
    try {
      await database.run('ROLLBACK');
    } catch (rollbackError) {
      logger.error({ error: rollbackError }, 'Failed to rollback database transaction');
    }
    throw error;
  }
}

function parsePhashValue(value: unknown): number[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as number[];
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return value as number[];
  }
  return null;
}

function phashSqlLiteral(phash: number[] | null | undefined): string {
  if (!phash || phash.length === 0) {
    return 'NULL';
  }
  return `[${phash.join(', ')}]::FLOAT[64]`;
}

export async function initDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  try {
    logger.info(`Initializing DuckDB at ${config.DUCKDB_PATH}`);

    db = await Database.create(config.DUCKDB_PATH);
    await runMigrations(db);

    logger.info('DuckDB initialized successfully');
    return db;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize DuckDB');
    throw error;
  }
}

export function getDatabase(): Database | null {
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    logger.info('DuckDB connection closed');
  }
}

export type ManifestArtifactKind = 'manifest-store' | 'proof-locator';

export interface ManifestArtifactRecord {
  manifestTxId: string;
  manifestId?: string | null;
  artifactKind?: ManifestArtifactKind;
  remoteManifestUrl?: string | null;
  manifestDigestAlg?: string | null;
  manifestDigestB64?: string | null;
  repoUrl?: string | null;
  fetchUrl?: string | null;
  originalHash: string | null;
  contentType: string;
  phash?: number[] | null;
  hasPriorManifest: boolean;
  claimGenerator: string;
  ownerAddress: string;
  blockHeight?: number;
  blockTimestamp?: Date;
}

export type ManifestRecord = ManifestArtifactRecord;

export interface SoftBindingRecord {
  alg: string;
  valueB64: string;
  scopeJson?: string | null;
}

function normalizeArtifactKind(value: string | null | undefined): ManifestArtifactKind {
  if (value === 'proof-locator') {
    return 'proof-locator';
  }
  return 'manifest-store';
}

function mapManifestRow(row: Record<string, unknown>): ManifestArtifactRecord {
  return {
    manifestTxId: row.manifest_tx_id as string,
    manifestId: (row.manifest_id as string) || null,
    artifactKind: normalizeArtifactKind(row.artifact_kind as string | null | undefined),
    remoteManifestUrl: (row.remote_manifest_url as string) || null,
    manifestDigestAlg: (row.manifest_digest_alg as string) || null,
    manifestDigestB64: (row.manifest_digest_b64 as string) || null,
    repoUrl: (row.repo_url as string) || null,
    fetchUrl: (row.fetch_url as string) || null,
    originalHash: (row.original_hash as string) ?? null,
    contentType: row.content_type as string,
    phash: parsePhashValue(row.phash),
    hasPriorManifest: row.has_prior_manifest as boolean,
    claimGenerator: row.claim_generator as string,
    ownerAddress: row.owner_address as string,
    blockHeight: row.block_height as number | undefined,
    blockTimestamp: row.block_timestamp as Date | undefined,
  };
}

/**
 * Insert a new manifest record into the database.
 */
export async function insertManifest(
  record: ManifestRecord,
  options: { database?: Database } = {}
): Promise<void> {
  const database = requireDatabase(options.database);
  const artifactKind = record.artifactKind ?? 'manifest-store';
  const phashLiteral = phashSqlLiteral(record.phash);

  await database.run(
    `INSERT INTO manifests (
      manifest_tx_id,
      manifest_id,
      artifact_kind,
      remote_manifest_url,
      manifest_digest_alg,
      manifest_digest_b64,
      repo_url,
      fetch_url,
      original_hash,
      content_type,
      phash,
      has_prior_manifest,
      claim_generator,
      owner_address,
      block_height,
      block_timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${phashLiteral}, ?, ?, ?, ?, ?)`,
    record.manifestTxId,
    record.manifestId ?? null,
    artifactKind,
    record.remoteManifestUrl ?? null,
    record.manifestDigestAlg ?? null,
    record.manifestDigestB64 ?? null,
    record.repoUrl ?? null,
    record.fetchUrl ?? null,
    record.originalHash,
    record.contentType,
    record.hasPriorManifest,
    record.claimGenerator,
    record.ownerAddress,
    record.blockHeight || null,
    record.blockTimestamp || null
  );

  logger.debug(
    { manifestTxId: record.manifestTxId, artifactKind, manifestId: record.manifestId ?? null },
    'Manifest artifact inserted into database'
  );
}

export async function upsertManifestArtifact(
  record: ManifestArtifactRecord,
  options: { database?: Database; useTransaction?: boolean } = {}
): Promise<void> {
  if (!record.manifestId) {
    throw new Error('manifestId is required for upsert');
  }

  const database = requireDatabase(options.database);
  const useTransaction = options.useTransaction ?? true;

  const run = async () => {
    await database.run(
      `DELETE FROM manifests WHERE manifest_id = ? OR manifest_tx_id = ?`,
      record.manifestId,
      record.manifestTxId
    );
    await insertManifest(record, { database });
  };

  if (useTransaction) {
    await runInTransaction(database, run);
  } else {
    await run();
  }
}

/**
 * Replace soft binding records for a manifest.
 */
export async function replaceSoftBindings(
  manifestId: string,
  bindings: SoftBindingRecord[],
  options: { database?: Database; useTransaction?: boolean } = {}
): Promise<void> {
  const database = requireDatabase(options.database);
  const useTransaction = options.useTransaction ?? true;

  const run = async () => {
    await database.run(`DELETE FROM soft_bindings WHERE manifest_id = ?`, manifestId);

    for (const binding of bindings) {
      await database.run(
        `INSERT INTO soft_bindings (manifest_id, alg, value_b64, scope_json) VALUES (?, ?, ?, ?)`,
        manifestId,
        binding.alg,
        binding.valueB64,
        binding.scopeJson ?? null
      );
    }
  };

  if (useTransaction) {
    await runInTransaction(database, run);
  } else {
    await run();
  }
}

/**
 * Get a manifest by transaction ID.
 */
export async function getManifestByTxId(txId: string): Promise<ManifestRecord | null> {
  const database = requireDatabase();

  const result = await database.all(`SELECT * FROM manifests WHERE manifest_tx_id = ?`, txId);

  if (result.length === 0) {
    return null;
  }

  const row = result[0] as Record<string, unknown>;
  return mapManifestRow(row);
}

/**
 * Get a manifest by C2PA manifest ID (URN).
 */
export async function getManifestById(manifestId: string): Promise<ManifestRecord | null> {
  return getManifestArtifactById(manifestId);
}

export async function getManifestArtifactById(
  manifestId: string
): Promise<ManifestArtifactRecord | null> {
  const database = requireDatabase();

  const result = await database.all(`SELECT * FROM manifests WHERE manifest_id = ?`, manifestId);

  if (result.length === 0) {
    return null;
  }

  const row = result[0] as Record<string, unknown>;
  return mapManifestRow(row);
}

/**
 * Search for similar manifests by pHash using L2 (Euclidean) distance
 * on the normalized float-array representation.
 */
export async function searchSimilarByPHash(
  phash: number[],
  threshold: number = 10,
  limit: number = 10
): Promise<Array<ManifestRecord & { distance: number }>> {
  const database = requireDatabase();

  const phashArray = `[${phash.join(', ')}]`;

  const result = await database.all(
    `SELECT *,
      array_distance(phash, ${phashArray}::FLOAT[64]) AS distance
    FROM manifests
    WHERE manifest_id IS NOT NULL AND phash IS NOT NULL
      AND array_distance(phash, ${phashArray}::FLOAT[64]) <= ?
    ORDER BY distance ASC
    LIMIT ?`,
    threshold,
    limit
  );

  return result.map((row: Record<string, unknown>) => ({
    ...mapManifestRow(row),
    distance: Number(row.distance),
  }));
}

/**
 * Look up soft bindings by exact algorithm + value match.
 * Returns manifest IDs that have matching soft binding records.
 */
export async function lookupSoftBindingsByExactValue(
  alg: string,
  valueB64: string,
  limit: number = 10
): Promise<Array<{ manifestId: string }>> {
  const database = requireDatabase();

  const result = await database.all(
    `SELECT DISTINCT sb.manifest_id
     FROM soft_bindings sb
     WHERE sb.alg = ? AND sb.value_b64 = ?
     ORDER BY sb.created_at DESC
     LIMIT ?`,
    alg,
    valueB64,
    limit
  );

  return result
    .map((row: Record<string, unknown>) => ({
      manifestId: row.manifest_id as string,
    }))
    .filter((r) => !!r.manifestId);
}

/**
 * Get total count of manifests.
 */
export async function getManifestCount(): Promise<number> {
  const database = requireDatabase();

  const result = await database.all('SELECT COUNT(*) as count FROM manifests');
  return Number((result[0] as { count: bigint }).count);
}

export async function insertManifestWithBindings(
  record: ManifestRecord,
  bindings: SoftBindingRecord[]
): Promise<void> {
  await upsertManifestArtifactWithBindings(record, bindings);
}

export async function upsertManifestArtifactWithBindings(
  record: ManifestArtifactRecord,
  bindings: SoftBindingRecord[]
): Promise<void> {
  if (!record.manifestId) {
    throw new Error('manifestId is required to store soft bindings');
  }

  const database = requireDatabase();

  await runInTransaction(database, async () => {
    await upsertManifestArtifact(record, { database, useTransaction: false });
    await replaceSoftBindings(record.manifestId as string, bindings, {
      database,
      useTransaction: false,
    });
  });
}
