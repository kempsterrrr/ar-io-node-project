import type { Database } from 'duckdb-async';
import { logger } from '../utils/logger.js';

export async function initializeSchema(db: Database): Promise<void> {
  logger.info('Initializing database schema');

  // Create sequences for auto-increment (DuckDB doesn't support AUTOINCREMENT keyword)
  await db.run(`CREATE SEQUENCE IF NOT EXISTS manifests_id_seq START 1`);
  await db.run(`CREATE SEQUENCE IF NOT EXISTS soft_bindings_id_seq START 1`);

  // Create manifests table
  await db.run(`
    CREATE TABLE IF NOT EXISTS manifests (
      id INTEGER PRIMARY KEY DEFAULT nextval('manifests_id_seq'),

      -- Arweave identifiers
      manifest_tx_id VARCHAR(43) UNIQUE NOT NULL,
      manifest_id VARCHAR(255),
      artifact_kind VARCHAR(32) NOT NULL DEFAULT 'manifest-store',
      remote_manifest_url VARCHAR(2048),
      manifest_digest_alg VARCHAR(64),
      manifest_digest_b64 VARCHAR(512),
      repo_url VARCHAR(2048),
      fetch_url VARCHAR(2048),

      -- Original image info (not stored, just metadata)
      original_hash VARCHAR(64),
      content_type VARCHAR(64) NOT NULL,

      -- pHash for similarity search (64 floats for L2 = Hamming)
      phash FLOAT[64],

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

  // Backfill-compatible schema evolution
  await db.run(`ALTER TABLE manifests ADD COLUMN IF NOT EXISTS manifest_id VARCHAR(255)`);
  await db.run(
    `ALTER TABLE manifests ADD COLUMN IF NOT EXISTS artifact_kind VARCHAR(32) DEFAULT 'manifest-store'`
  );
  await db.run(`ALTER TABLE manifests ADD COLUMN IF NOT EXISTS remote_manifest_url VARCHAR(2048)`);
  await db.run(`ALTER TABLE manifests ADD COLUMN IF NOT EXISTS manifest_digest_alg VARCHAR(64)`);
  await db.run(`ALTER TABLE manifests ADD COLUMN IF NOT EXISTS manifest_digest_b64 VARCHAR(512)`);
  await db.run(`ALTER TABLE manifests ADD COLUMN IF NOT EXISTS repo_url VARCHAR(2048)`);
  await db.run(`ALTER TABLE manifests ADD COLUMN IF NOT EXISTS fetch_url VARCHAR(2048)`);
  await db.run(`UPDATE manifests SET artifact_kind = 'manifest-store' WHERE artifact_kind IS NULL`);

  // Create soft_bindings table for manifest repository lookups
  await db.run(`
    CREATE TABLE IF NOT EXISTS soft_bindings (
      id INTEGER PRIMARY KEY DEFAULT nextval('soft_bindings_id_seq'),
      manifest_id VARCHAR(255) NOT NULL,
      alg VARCHAR(255) NOT NULL,
      value_b64 VARCHAR(2048) NOT NULL,
      scope_json VARCHAR(4096),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_manifests_manifest_id
    ON manifests(manifest_id)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_manifests_owner
    ON manifests(owner_address)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_manifests_content_type
    ON manifests(content_type)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_manifests_artifact_kind
    ON manifests(artifact_kind)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_manifests_remote_manifest_url
    ON manifests(remote_manifest_url)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_soft_bindings_alg
    ON soft_bindings(alg)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_soft_bindings_manifest
    ON soft_bindings(manifest_id)
  `);

  // Note: HNSW index for vector similarity will be created when vss extension is loaded
  // For now, we'll use brute-force similarity search which works for moderate dataset sizes

  logger.info('Database schema initialized');
}
