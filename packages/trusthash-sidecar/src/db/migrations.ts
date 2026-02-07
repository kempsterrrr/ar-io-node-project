import type { Database } from 'duckdb-async';
import { logger } from '../utils/logger.js';
import { initializeSchema } from './schema.js';

type Migration = {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'base_schema',
    up: async (db) => {
      await initializeSchema(db);
    },
  },
  {
    version: 2,
    name: 'original_hash_nullable',
    up: async (db) => {
      const hasManifests = await tableExists(db, 'manifests');
      if (!hasManifests) {
        return;
      }

      const notNull = await isColumnNotNull(db, 'manifests', 'original_hash');
      if (!notNull) {
        logger.info('original_hash already nullable; skipping migration');
        return;
      }

      logger.info('Migrating manifests.original_hash to nullable (table rewrite)');

      await db.run('BEGIN TRANSACTION');
      try {
        await db.run('DROP TABLE IF EXISTS manifests_new');
        await db.run(`
          CREATE TABLE manifests_new (
            id INTEGER PRIMARY KEY DEFAULT nextval('manifests_id_seq'),
            manifest_tx_id VARCHAR(43) UNIQUE NOT NULL,
            manifest_id VARCHAR(255),
            original_hash VARCHAR(64),
            content_type VARCHAR(64) NOT NULL,
            phash FLOAT[64] NOT NULL,
            has_prior_manifest BOOLEAN DEFAULT FALSE,
            claim_generator VARCHAR(255),
            owner_address VARCHAR(43) NOT NULL,
            block_height BIGINT,
            block_timestamp TIMESTAMP,
            indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await db.run(`
          INSERT INTO manifests_new (
            id,
            manifest_tx_id,
            manifest_id,
            original_hash,
            content_type,
            phash,
            has_prior_manifest,
            claim_generator,
            owner_address,
            block_height,
            block_timestamp,
            indexed_at
          )
          SELECT
            id,
            manifest_tx_id,
            manifest_id,
            original_hash,
            content_type,
            phash,
            has_prior_manifest,
            claim_generator,
            owner_address,
            block_height,
            block_timestamp,
            indexed_at
          FROM manifests
        `);

        await db.run('DROP TABLE manifests');
        await db.run('ALTER TABLE manifests_new RENAME TO manifests');

        await recreateManifestsIndexes(db);
        await bumpSequence(db, 'manifests_id_seq', 'manifests', 'id');

        await db.run('COMMIT');
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    },
  },
  {
    version: 3,
    name: 'remove_arns_columns',
    up: async (db) => {
      const hasManifests = await tableExists(db, 'manifests');
      if (!hasManifests) {
        return;
      }

      const hasArnsUndername = await hasColumn(db, 'manifests', 'arns_undername');
      const hasArnsFullUrl = await hasColumn(db, 'manifests', 'arns_full_url');

      if (!hasArnsUndername && !hasArnsFullUrl) {
        logger.info('ArNS columns already removed; skipping migration');
        return;
      }

      logger.info('Removing ArNS columns from manifests (table rewrite)');

      await db.run('BEGIN TRANSACTION');
      try {
        await db.run('DROP TABLE IF EXISTS manifests_new');
        await db.run(`
          CREATE TABLE manifests_new (
            id INTEGER PRIMARY KEY DEFAULT nextval('manifests_id_seq'),
            manifest_tx_id VARCHAR(43) UNIQUE NOT NULL,
            manifest_id VARCHAR(255),
            original_hash VARCHAR(64),
            content_type VARCHAR(64) NOT NULL,
            phash FLOAT[64] NOT NULL,
            has_prior_manifest BOOLEAN DEFAULT FALSE,
            claim_generator VARCHAR(255),
            owner_address VARCHAR(43) NOT NULL,
            block_height BIGINT,
            block_timestamp TIMESTAMP,
            indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await db.run(`
          INSERT INTO manifests_new (
            id,
            manifest_tx_id,
            manifest_id,
            original_hash,
            content_type,
            phash,
            has_prior_manifest,
            claim_generator,
            owner_address,
            block_height,
            block_timestamp,
            indexed_at
          )
          SELECT
            id,
            manifest_tx_id,
            manifest_id,
            original_hash,
            content_type,
            phash,
            has_prior_manifest,
            claim_generator,
            owner_address,
            block_height,
            block_timestamp,
            indexed_at
          FROM manifests
        `);

        await db.run('DROP TABLE manifests');
        await db.run('ALTER TABLE manifests_new RENAME TO manifests');

        await recreateManifestsIndexes(db);
        await bumpSequence(db, 'manifests_id_seq', 'manifests', 'id');

        await db.run('COMMIT');
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    },
  },
];

export async function runMigrations(db: Database): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const rows = (await db.all(`SELECT version FROM schema_migrations`)) as Array<{
    version: number;
  }>;
  const applied = new Set(rows.map((row) => Number(row.version)));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }

    logger.info(`Running migration ${migration.version}: ${migration.name}`);
    await migration.up(db);
    await db.run(
      `INSERT INTO schema_migrations (version, name) VALUES (?, ?)`,
      migration.version,
      migration.name
    );
    logger.info(`Migration ${migration.version} applied`);
  }
}

async function tableExists(db: Database, tableName: string): Promise<boolean> {
  const rows = (await db.all(
    `SELECT 1 FROM information_schema.tables WHERE table_name = '${tableName}'`
  )) as Array<{ '1': number }>;
  return rows.length > 0;
}

async function isColumnNotNull(
  db: Database,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const rows = (await db.all(`PRAGMA table_info('${tableName}')`)) as Array<{
    name: string;
    notnull: number;
  }>;

  const match = rows.find((row) => row.name === columnName);
  if (!match) {
    return false;
  }

  return Number(match.notnull) === 1;
}

async function hasColumn(db: Database, tableName: string, columnName: string): Promise<boolean> {
  const rows = (await db.all(`PRAGMA table_info('${tableName}')`)) as Array<{ name: string }>;

  return rows.some((row) => row.name === columnName);
}

async function recreateManifestsIndexes(db: Database): Promise<void> {
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
}

async function bumpSequence(
  db: Database,
  sequenceName: string,
  tableName: string,
  columnName: string
): Promise<void> {
  const seqRows = (await db.all(
    `SELECT start_value, last_value, increment_by FROM duckdb_sequences() WHERE sequence_name = '${sequenceName}'`
  )) as Array<{ start_value: number; last_value: number | null; increment_by: number }>;

  const rows = (await db.all(`SELECT MAX(${columnName}) AS max_id FROM ${tableName}`)) as Array<{
    max_id: number | null;
  }>;
  const maxId = Number(rows[0]?.max_id ?? 0);

  if (seqRows.length === 0) {
    return;
  }

  const seq = seqRows[0];
  const startValue = Number(seq.start_value ?? 1);
  const incrementBy = Number(seq.increment_by ?? 1);
  const lastValue =
    seq.last_value === null || seq.last_value === undefined ? null : Number(seq.last_value);
  const nextValue = lastValue === null ? startValue : lastValue + incrementBy;
  const targetNext = maxId + 1;

  const delta = Math.floor(targetNext - nextValue);
  if (delta > 0) {
    await db.all(`SELECT max(nextval('${sequenceName}')) AS value FROM range(0, ${delta})`);
  }
}
