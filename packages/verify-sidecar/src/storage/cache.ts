import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { VerificationResult } from '../types.js';

let db: Database.Database;

export function initCache(): void {
  const dbPath = config.SQLITE_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_results (
      id TEXT PRIMARY KEY,
      tx_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_verification_results_tx_id
    ON verification_results(tx_id)
  `);

  logger.info({ path: dbPath }, 'Verification cache initialized');
}

export function saveResult(result: VerificationResult): void {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO verification_results (id, tx_id, result_json, created_at) VALUES (?, ?, ?, ?)'
  );
  stmt.run(result.verificationId, result.txId, JSON.stringify(result), result.timestamp);
}

export function getResultById(verificationId: string): VerificationResult | null {
  const row = db
    .prepare('SELECT result_json FROM verification_results WHERE id = ?')
    .get(verificationId) as { result_json: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.result_json) as VerificationResult;
}

export function closeCache(): void {
  if (db) {
    db.close();
    logger.info('Verification cache closed');
  }
}
