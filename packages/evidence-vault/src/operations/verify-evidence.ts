import type { AgenticWay } from '@agenticway/sdk';
import type { VerifyEvidenceOptions, VerifyEvidenceResult } from '../types.js';
import { TAG_NAMES } from '../tags.js';

/**
 * Verify evidence data against an existing Arweave anchor.
 *
 * Re-hashes the evidence, compares it against the on-chain hash,
 * and returns AIUC-1 metadata from the anchor tags.
 */
export async function executeVerifyEvidence(
  sdk: AgenticWay,
  options: VerifyEvidenceOptions
): Promise<VerifyEvidenceResult> {
  const baseResult = await sdk.verifyAnchor({
    data: options.data,
    txId: options.txId,
  });

  // Fetch transaction tags for AIUC-1 metadata
  const txInfo = await sdk.gateway.fetchTransactionInfo(options.txId);
  const tagMap = new Map(
    txInfo.tags.map((t: { name: string; value: string }) => [t.name, t.value])
  );

  return {
    valid: baseResult.valid,
    hash: baseResult.hash,
    anchoredHash: baseResult.anchoredHash,
    controlId: tagMap.get(TAG_NAMES.AIUC1_CONTROL_ID) ?? null,
    domain: tagMap.get(TAG_NAMES.AIUC1_DOMAIN) ?? null,
    evidenceType: tagMap.get(TAG_NAMES.EVIDENCE_TYPE) ?? null,
    blockHeight: baseResult.blockHeight,
    timestamp: baseResult.timestamp,
  };
}
