import type { AgenticWay } from '@agenticway/sdk';
import { sha256Hex } from '@agenticway/sdk';
import type { VerifyEntryOptions, VerifyEntryResult } from '../types.js';
import { serializeEntry } from './flush-batch.js';

/**
 * Verify a single audit log entry against its Arweave-anchored batch.
 *
 * 1. Hash the entry's deterministic serialization (SHA-256).
 * 2. Verify the hash matches the proof's leaf hash.
 * 3. Walk the Merkle proof path to compute the expected root.
 * 4. Fetch the batch anchor transaction via GraphQL and confirm
 *    the on-chain Merkle-Root tag matches the computed root.
 */
export async function executeVerifyEntry(
  sdk: AgenticWay,
  options: VerifyEntryOptions
): Promise<VerifyEntryResult> {
  const data = serializeEntry(options.entry);
  const entryHash = sha256Hex(data);

  // Step 1: Verify the entry hash matches the proof's leaf
  const hashMatches = entryHash === options.proof.hash;

  // Step 2: Walk the Merkle proof to compute the root
  let computedRoot = options.proof.hash;
  for (const step of options.proof.proof) {
    const left = step.position === 'left' ? step.hash : computedRoot;
    const right = step.position === 'left' ? computedRoot : step.hash;
    const combined = Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]);
    computedRoot = sha256Hex(combined);
  }

  // Step 3: Fetch the anchor transaction's tags + block info
  const txInfo = await sdk.gateway.fetchTransactionInfo(options.txId);
  const merkleRootTag = txInfo.tags.find((t) => t.name === 'Merkle-Root');
  const onChainValid = merkleRootTag?.value === computedRoot;

  const blockHeight = txInfo.block?.height ?? null;
  const timestamp = txInfo.block?.timestamp
    ? new Date(txInfo.block.timestamp * 1000).toISOString()
    : null;

  return {
    valid: hashMatches && onChainValid,
    entryHash,
    merkleProofValid: hashMatches,
    onChainValid,
    blockHeight,
    timestamp,
  };
}
