import type { AgenticWay } from '@agenticway/sdk';
import type { StorageAdapter, AuditorVerifyOptions, AuditorVerifyResult } from '../types.js';
import { executeVerifyEvidence } from './verify-evidence.js';

/**
 * Full auditor verification flow:
 * 1. Retrieve evidence from enterprise storage
 * 2. Hash the evidence
 * 3. Compare against Arweave anchor proof
 * 4. Return verification result with full proof chain
 */
export async function executeAuditorVerify(
  sdk: AgenticWay,
  storage: StorageAdapter,
  options: AuditorVerifyOptions
): Promise<AuditorVerifyResult> {
  // Step 1: Retrieve evidence from enterprise storage
  const data = await storage.retrieve(options.storageKey);

  // Steps 2-3: Verify against anchor
  const result = await executeVerifyEvidence(sdk, {
    data,
    txId: options.txId,
  });

  return {
    valid: result.valid,
    hash: result.hash,
    anchoredHash: result.anchoredHash,
    controlId: result.controlId,
    domain: result.domain,
    evidenceType: result.evidenceType,
    blockHeight: result.blockHeight,
    timestamp: result.timestamp,
    storageKey: options.storageKey,
  };
}
