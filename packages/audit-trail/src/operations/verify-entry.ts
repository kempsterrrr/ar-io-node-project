import type { AgenticWay } from '@agenticway/sdk';
import type { AuditLogEntry, VerifyEntryOptions, VerifyEntryResult } from '../types.js';
import { serializeEntry } from './flush-batch.js';

/**
 * Verify a single audit log entry against its Arweave-anchored batch.
 *
 * Computes the SHA-256 hash of the entry's deterministic serialization
 * and verifies it against the batch anchor transaction using the SDK.
 */
export async function executeVerifyEntry(
  sdk: AgenticWay,
  options: VerifyEntryOptions
): Promise<VerifyEntryResult> {
  const data = serializeEntry(options.entry);

  const result = await sdk.verifyAnchor({
    data,
    txId: options.txId,
  });

  return {
    valid: result.valid,
    entryHash: result.hash,
    blockHeight: result.blockHeight,
    timestamp: result.timestamp,
  };
}
