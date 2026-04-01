import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { VerificationResult } from '../types.js';

const CACHE_MAX_AGE_DAYS = 30;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let db: Database.Database;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

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

  pruneExpired();
  cleanupTimer = setInterval(pruneExpired, CLEANUP_INTERVAL_MS);

  logger.info({ path: dbPath }, 'Verification cache initialized');
}

function pruneExpired(): void {
  try {
    const result = db
      .prepare(`DELETE FROM verification_results WHERE created_at < datetime('now', ?)`)
      .run(`-${CACHE_MAX_AGE_DAYS} days`);
    if (result.changes > 0) {
      logger.info({ deleted: result.changes }, 'Pruned expired verification results');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to prune expired results');
  }
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

export function getResultsByTxId(txId: string): VerificationResult[] {
  const rows = db
    .prepare(
      'SELECT result_json FROM verification_results WHERE tx_id = ? ORDER BY created_at DESC'
    )
    .all(txId) as { result_json: string }[];

  return rows.map((row) => JSON.parse(row.result_json) as VerificationResult);
}

export function closeCache(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (db) {
    db.close();
    logger.info('Verification cache closed');
  }
}
