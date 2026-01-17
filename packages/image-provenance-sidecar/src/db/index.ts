import { Database } from 'duckdb-async';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { initializeSchema } from './schema.js';

let db: Database | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  try {
    logger.info(`Initializing DuckDB at ${config.DUCKDB_PATH}`);

    // Create database connection
    db = await Database.create(config.DUCKDB_PATH);

    // Initialize schema
    await initializeSchema(db);

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
  arnsUndername: string;
  arnsFullUrl: string;
  originalHash: string;
  contentType: string;
  phash: number[];
  hasPriorManifest: boolean;
  claimGenerator: string;
  ownerAddress: string;
  blockHeight?: number;
  blockTimestamp?: Date;
}

/**
 * Insert a new manifest record into the database.
 */
export async function insertManifest(record: ManifestRecord): Promise<void> {
  const database = getDatabase();
  if (!database) {
    throw new Error('Database not initialized');
  }

  const phashArray = `[${record.phash.join(', ')}]`;

  await database.run(
    `INSERT INTO manifests (
      manifest_tx_id,
      arns_undername,
      arns_full_url,
      original_hash,
      content_type,
      phash,
      has_prior_manifest,
      claim_generator,
      owner_address,
      block_height,
      block_timestamp
    ) VALUES (?, ?, ?, ?, ?, ${phashArray}::FLOAT[64], ?, ?, ?, ?, ?)`,
    record.manifestTxId,
    record.arnsUndername,
    record.arnsFullUrl,
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
 * Get a manifest by transaction ID.
 */
export async function getManifestByTxId(txId: string): Promise<ManifestRecord | null> {
  const database = getDatabase();
  if (!database) {
    throw new Error('Database not initialized');
  }

  const result = await database.all(`SELECT * FROM manifests WHERE manifest_tx_id = ?`, txId);

  if (result.length === 0) {
    return null;
  }

  const row = result[0] as Record<string, unknown>;

  // DuckDB returns FLOAT[] as a string like "[0.0, 1.0, ...]", need to parse it
  let phash: number[] = [];
  if (typeof row.phash === 'string') {
    phash = JSON.parse(row.phash);
  } else if (Array.isArray(row.phash)) {
    phash = row.phash;
  }

  return {
    manifestTxId: row.manifest_tx_id as string,
    arnsUndername: row.arns_undername as string,
    arnsFullUrl: row.arns_full_url as string,
    originalHash: row.original_hash as string,
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
  const database = getDatabase();
  if (!database) {
    throw new Error('Database not initialized');
  }

  const phashArray = `[${phash.join(', ')}]`;

  // Use L2 distance which equals Hamming for binary vectors
  const result = await database.all(
    `SELECT *,
      array_distance(phash, ${phashArray}::FLOAT[64]) as distance
    FROM manifests
    WHERE array_distance(phash, ${phashArray}::FLOAT[64]) <= ?
    ORDER BY distance ASC
    LIMIT ?`,
    threshold,
    limit
  );

  return result.map((row: Record<string, unknown>) => ({
    manifestTxId: row.manifest_tx_id as string,
    arnsUndername: row.arns_undername as string,
    arnsFullUrl: row.arns_full_url as string,
    originalHash: row.original_hash as string,
    contentType: row.content_type as string,
    phash: row.phash as number[],
    hasPriorManifest: row.has_prior_manifest as boolean,
    claimGenerator: row.claim_generator as string,
    ownerAddress: row.owner_address as string,
    blockHeight: row.block_height as number | undefined,
    blockTimestamp: row.block_timestamp as Date | undefined,
    distance: row.distance as number,
  }));
}

/**
 * Get total count of manifests in database.
 */
export async function getManifestCount(): Promise<number> {
  const database = getDatabase();
  if (!database) {
    throw new Error('Database not initialized');
  }

  const result = await database.all('SELECT COUNT(*) as count FROM manifests');
  // DuckDB returns BigInt for COUNT(*), convert to Number for JSON serialization
  return Number((result[0] as { count: bigint }).count);
}
