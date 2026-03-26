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
  {
    version: 4,
    name: 'manifest_artifact_columns_and_nullable_phash',
    up: async (db) => {
      const hasManifests = await tableExists(db, 'manifests');
      if (!hasManifests) {
        return;
      }

      const hasArtifactKind = await hasColumn(db, 'manifests', 'artifact_kind');
      const hasRemoteManifestUrl = await hasColumn(db, 'manifests', 'remote_manifest_url');
      const hasManifestDigestAlg = await hasColumn(db, 'manifests', 'manifest_digest_alg');
      const hasManifestDigestB64 = await hasColumn(db, 'manifests', 'manifest_digest_b64');
      const hasRepoUrl = await hasColumn(db, 'manifests', 'repo_url');
      const hasFetchUrl = await hasColumn(db, 'manifests', 'fetch_url');
      const hasPHash = await hasColumn(db, 'manifests', 'phash');
      const phashNotNull = await isColumnNotNull(db, 'manifests', 'phash');

      if (
        hasArtifactKind &&
        hasRemoteManifestUrl &&
        hasManifestDigestAlg &&
        hasManifestDigestB64 &&
        hasRepoUrl &&
        hasFetchUrl &&
        hasPHash &&
        !phashNotNull
      ) {
        logger.info('Manifest artifact columns already applied; skipping migration');
        return;
      }

      logger.info('Applying manifest artifact columns and nullable phash (table rewrite)');

      const artifactKindExpr = hasArtifactKind
        ? "COALESCE(artifact_kind, 'manifest-store')"
        : "'manifest-store'";
      const remoteManifestUrlExpr = hasRemoteManifestUrl ? 'remote_manifest_url' : 'NULL';
      const digestAlgExpr = hasManifestDigestAlg ? 'manifest_digest_alg' : 'NULL';
      const digestB64Expr = hasManifestDigestB64 ? 'manifest_digest_b64' : 'NULL';
      const repoUrlExpr = hasRepoUrl ? 'repo_url' : 'NULL';
      const fetchUrlExpr = hasFetchUrl ? 'fetch_url' : 'NULL';
      const phashExpr = hasPHash ? 'phash' : 'NULL';

      await db.run('BEGIN TRANSACTION');
      try {
        await db.run('DROP TABLE IF EXISTS manifests_new');
        await db.run(`
          CREATE TABLE manifests_new (
            id INTEGER PRIMARY KEY DEFAULT nextval('manifests_id_seq'),
            manifest_tx_id VARCHAR(43) UNIQUE NOT NULL,
            manifest_id VARCHAR(255),
            artifact_kind VARCHAR(32) NOT NULL DEFAULT 'manifest-store',
            remote_manifest_url VARCHAR(2048),
            manifest_digest_alg VARCHAR(64),
            manifest_digest_b64 VARCHAR(512),
            repo_url VARCHAR(2048),
            fetch_url VARCHAR(2048),
            original_hash VARCHAR(64),
            content_type VARCHAR(64) NOT NULL,
            phash FLOAT[64],
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
            block_timestamp,
            indexed_at
          )
          SELECT
            id,
            manifest_tx_id,
            manifest_id,
            ${artifactKindExpr},
            ${remoteManifestUrlExpr},
            ${digestAlgExpr},
            ${digestB64Expr},
            ${repoUrlExpr},
            ${fetchUrlExpr},
            original_hash,
            content_type,
            ${phashExpr},
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
  // Indexes on columns that exist since v1
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

  // Indexes on columns added in v4 — guard for v2/v3 replay safety
  if (await hasColumn(db, 'manifests', 'artifact_kind')) {
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_manifests_artifact_kind
      ON manifests(artifact_kind)
    `);
  }

  if (await hasColumn(db, 'manifests', 'remote_manifest_url')) {
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_manifests_remote_manifest_url
      ON manifests(remote_manifest_url)
    `);
  }
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
