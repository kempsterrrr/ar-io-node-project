import { Database } from 'duckdb-async';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { runMigrations } from './db/migrations.js';

async function main(): Promise<void> {
  const db = await Database.create(config.DUCKDB_PATH);
  try {
    await runMigrations(db);
    logger.info('Migrations complete');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  logger.error({ error }, 'Migration failed');
  process.exit(1);
});
