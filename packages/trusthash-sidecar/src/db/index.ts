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

function parsePhashValue(value: unknown): number[] {
  if (typeof value === 'string') {
    return JSON.parse(value) as number[];
  }
  if (Array.isArray(value)) {
    return value as number[];
  }
  return [];
}

export async function initDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  try {
    logger.info(`Initializing DuckDB at ${config.DUCKDB_PATH}`);

    // Create database connection
    db = await Database.create(config.DUCKDB_PATH);

    // Run schema migrations
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

/**
 * Manifest record for database operations
 */
export interface ManifestRecord {
  manifestTxId: string;
  manifestId?: string | null;
  originalHash: string | null;
  contentType: string;
  phash: number[];
  hasPriorManifest: boolean;
  claimGenerator: string;
  ownerAddress: string;
  blockHeight?: number;
  blockTimestamp?: Date;
}

export interface SoftBindingRecord {
  alg: string;
  valueB64: string;
  scopeJson?: string | null;
}

/**
 * Insert a new manifest record into the database.
 */
export async function insertManifest(
  record: ManifestRecord,
  options: { database?: Database } = {}
): Promise<void> {
  const database = requireDatabase(options.database);

  const phashArray = `[${record.phash.join(', ')}]`;

  await database.run(
    `INSERT INTO manifests (
      manifest_tx_id,
      manifest_id,
      original_hash,
      content_type,
      phash,
      has_prior_manifest,
      claim_generator,
      owner_address,
      block_height,
      block_timestamp
    ) VALUES (?, ?, ?, ?, ${phashArray}::FLOAT[64], ?, ?, ?, ?, ?)`,
    record.manifestTxId,
    record.manifestId ?? null,
    record.originalHash,
    record.contentType,
    record.hasPriorManifest,
    record.claimGenerator,
    record.ownerAddress,
    record.blockHeight || null,
    record.blockTimestamp || null
  );

  logger.debug({ manifestTxId: record.manifestTxId }, 'Manifest inserted into database');
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

  // DuckDB returns FLOAT[] as a string like "[0.0, 1.0, ...]", need to parse it
  const phash = parsePhashValue(row.phash);

  return {
    manifestTxId: row.manifest_tx_id as string,
    manifestId: (row.manifest_id as string) || null,
    originalHash: (row.original_hash as string) ?? null,
    contentType: row.content_type as string,
    phash,
    hasPriorManifest: row.has_prior_manifest as boolean,
    claimGenerator: row.claim_generator as string,
    ownerAddress: row.owner_address as string,
    blockHeight: row.block_height as number | undefined,
    blockTimestamp: row.block_timestamp as Date | undefined,
  };
}

/**
 * Get a manifest by C2PA manifest ID (URN).
 */
export async function getManifestById(manifestId: string): Promise<ManifestRecord | null> {
  const database = requireDatabase();

  const result = await database.all(`SELECT * FROM manifests WHERE manifest_id = ?`, manifestId);

  if (result.length === 0) {
    return null;
  }

  const row = result[0] as Record<string, unknown>;

  const phash = parsePhashValue(row.phash);

  return {
    manifestTxId: row.manifest_tx_id as string,
    manifestId: (row.manifest_id as string) || null,
    originalHash: (row.original_hash as string) ?? null,
    contentType: row.content_type as string,
    phash,
    hasPriorManifest: row.has_prior_manifest as boolean,
    claimGenerator: row.claim_generator as string,
    ownerAddress: row.owner_address as string,
    blockHeight: row.block_height as number | undefined,
    blockTimestamp: row.block_timestamp as Date | undefined,
  };
}

/**
 * Search for similar manifests by pHash using Hamming distance.
 */
export async function searchSimilarByPHash(
  phash: number[],
  threshold: number = 10,
  limit: number = 10
): Promise<Array<ManifestRecord & { distance: number }>> {
  const database = requireDatabase();

  const phashArray = `[${phash.join(', ')}]`;

  // L2 distance squared equals Hamming distance for binary vectors.
  const result = await database.all(
    `WITH candidates AS (
      SELECT *,
        array_distance(phash, ${phashArray}::FLOAT[64]) AS l2_distance
      FROM manifests
      WHERE manifest_id IS NOT NULL
    )
    SELECT *,
      (l2_distance * l2_distance) AS distance
    FROM candidates
    WHERE (l2_distance * l2_distance) <= ?
    ORDER BY distance ASC
    LIMIT ?`,
    threshold,
    limit
  );

  return result.map((row: Record<string, unknown>) => ({
    manifestTxId: row.manifest_tx_id as string,
    manifestId: (row.manifest_id as string) || null,
    originalHash: (row.original_hash as string) ?? null,
    contentType: row.content_type as string,
    phash: parsePhashValue(row.phash),
    hasPriorManifest: row.has_prior_manifest as boolean,
    claimGenerator: row.claim_generator as string,
    ownerAddress: row.owner_address as string,
    blockHeight: row.block_height as number | undefined,
    blockTimestamp: row.block_timestamp as Date | undefined,
    distance: Number(row.distance),
  }));
}

/**
 * Get total count of manifests in database.
 */
export async function getManifestCount(): Promise<number> {
  const database = requireDatabase();

  const result = await database.all('SELECT COUNT(*) as count FROM manifests');
  // DuckDB returns BigInt for COUNT(*), convert to Number for JSON serialization
  return Number((result[0] as { count: bigint }).count);
}

export async function insertManifestWithBindings(
  record: ManifestRecord,
  bindings: SoftBindingRecord[]
): Promise<void> {
  if (!record.manifestId) {
    throw new Error('manifestId is required to store soft bindings');
  }

  const database = requireDatabase();

  await runInTransaction(database, async () => {
    await insertManifest(record, { database });
    await replaceSoftBindings(record.manifestId as string, bindings, {
      database,
      useTransaction: false,
    });
  });
}
