import type { VerifyAnchorOptions, VerifyAnchorResult } from '../types.js';
import { GatewayClient } from '../clients/gateway.js';
import { sha256Hex } from '../integrity/merkle.js';

/**
 * Verify data against an existing integrity anchor on Arweave.
 *
 * Re-hashes the provided data and compares it against the hash
 * stored in the anchor transaction's tags.
 */
export async function executeVerifyAnchor(
  gateway: GatewayClient,
  options: VerifyAnchorOptions
): Promise<VerifyAnchorResult> {
  const data = Buffer.isBuffer(options.data) ? options.data : Buffer.from(options.data);
  const hash = sha256Hex(data);

  // Fetch the anchor transaction tags + block info in one GraphQL call
  const txInfo = await gateway.fetchTransactionInfo(options.txId);

  const anchoredHash = txInfo.tags.find((t) => t.name === 'Data-Hash')?.value ?? null;
  const protocol = txInfo.tags.find((t) => t.name === 'Data-Protocol')?.value;

  if (protocol !== 'AgenticWay-Integrity') {
    return {
      valid: false,
      hash,
      anchoredHash: null,
      blockHeight: null,
      timestamp: null,
    };
  }

  const blockHeight = txInfo.block?.height ?? null;
  const timestamp =
    txInfo.block?.timestamp != null ? new Date(txInfo.block.timestamp * 1000).toISOString() : null;

  return {
    valid: anchoredHash === hash,
    hash,
    anchoredHash,
    blockHeight,
    timestamp,
  };
}
