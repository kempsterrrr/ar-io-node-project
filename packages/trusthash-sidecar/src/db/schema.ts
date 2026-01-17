import type { Database } from 'duckdb-async';
import { logger } from '../utils/logger.js';

export async function initializeSchema(db: Database): Promise<void> {
  logger.info('Initializing database schema');

  // Create sequences for auto-increment (DuckDB doesn't support AUTOINCREMENT keyword)
  await db.run(`CREATE SEQUENCE IF NOT EXISTS manifests_id_seq START 1`);
  await db.run(`CREATE SEQUENCE IF NOT EXISTS sync_state_id_seq START 1`);

  // Create manifests table
  await db.run(`
    CREATE TABLE IF NOT EXISTS manifests (
      id INTEGER PRIMARY KEY DEFAULT nextval('manifests_id_seq'),

      -- Arweave identifiers
      manifest_tx_id VARCHAR(43) UNIQUE NOT NULL,
      arns_undername VARCHAR(255) NOT NULL,
      arns_full_url VARCHAR(512) NOT NULL,

      -- Original image info (not stored, just metadata)
      original_hash VARCHAR(64) NOT NULL,
      content_type VARCHAR(64) NOT NULL,

      -- pHash for similarity search (64 floats for L2 = Hamming)
      phash FLOAT[64] NOT NULL,

      -- C2PA metadata
      has_prior_manifest BOOLEAN DEFAULT FALSE,
      claim_generator VARCHAR(255),

      -- Ownership
      owner_address VARCHAR(43) NOT NULL,

      -- Timestamps
      block_height BIGINT,
      block_timestamp TIMESTAMP,
      indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create sync_state table for tracking webhook processing
  await db.run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY DEFAULT nextval('sync_state_id_seq'),
      last_webhook_id VARCHAR(255),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_manifests_arns
    ON manifests(arns_undername)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_manifests_owner
    ON manifests(owner_address)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_manifests_content_type
    ON manifests(content_type)
  `);

  // Note: HNSW index for vector similarity will be created when vss extension is loaded
  // For now, we'll use brute-force similarity search which works for moderate dataset sizes

  logger.info('Database schema initialized');
}
