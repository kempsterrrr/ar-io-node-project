import { getTransaction, getTransactionStatus, getBlock } from '../gateway/client.js';
import { ownerToAddress } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import type { VerificationResult } from '../types.js';

interface MetadataOwner {
  address: string | null;
  publicKey: string | null;
}

export interface MetadataResult {
  existence: VerificationResult['existence'];
  owner: MetadataOwner;
  metadata: VerificationResult['metadata'];
  /** Raw tags from /tx in original base64url encoding (needed for signature verification deep hash) */
  rawTags: Array<{ name: string; value: string }>;
  /** Target from /tx (base64url, usually empty) */
  target: string;
  /** Anchor / last_tx from /tx (base64url) */
  anchor: string;
  /** Transaction format (1 or 2) — determines deep hash structure */
  format: number;
  /** Quantity in winston (string) */
  quantity: string;
  /** Reward in winston (string) */
  reward: string;
  /** Data root (base64url, format 2 only) */
  dataRoot: string;
  /** Signature from /tx body (base64url) — may be empty for data items served via headers */
  signatureFromTx: string;
}

/**
 * Pipeline Step 1: Fetch transaction metadata, confirmation status, and block timestamp.
 */
export async function fetchMetadata(txId: string): Promise<MetadataResult | null> {
  // 1a. Transaction data
  const tx = await getTransaction(txId);
  if (!tx) {
    return {
      existence: {
        status: 'not_found',
        blockHeight: null,
        blockTimestamp: null,
        blockId: null,
        confirmations: null,
      },
      owner: {
        address: null,
        publicKey: null,
      },
      metadata: {
        dataSize: null,
        contentType: null,
        tags: [],
      },
      rawTags: [],
      target: '',
      anchor: '',
      format: 0,
      quantity: '0',
      reward: '0',
      dataRoot: '',
      signatureFromTx: '',
    };
  }

  // Keep raw tags (base64url) for signature verification deep hash
  const rawTags = tx.tags;

  // Decode tags for display
  const tags = tx.tags.map((tag) => ({
    name: decodeB64Url(tag.name),
    value: decodeB64Url(tag.value),
  }));

  const contentTypeTag = tags.find((t) => t.name.toLowerCase() === 'content-type');

  const owner: MetadataOwner = {
    address: ownerToAddress(tx.owner),
    publicKey: tx.owner,
  };

  const metadata: VerificationResult['metadata'] = {
    dataSize: tx.data_size ? parseInt(tx.data_size, 10) : null,
    contentType: contentTypeTag?.value ?? null,
    tags,
  };

  // 1b. Confirmation status
  const status = await getTransactionStatus(txId);
  if (!status) {
    return {
      existence: {
        status: 'pending',
        blockHeight: null,
        blockTimestamp: null,
        blockId: null,
        confirmations: null,
      },
      owner,
      metadata,
      rawTags,
      target: tx.target,
      anchor: tx.last_tx,
      format: tx.format,
      quantity: tx.quantity,
      reward: tx.reward,
      dataRoot: tx.data_root,
      signatureFromTx: tx.signature,
    };
  }

  // 1c. Block timestamp
  let blockTimestamp: string | null = null;
  const block = await getBlock(status.block_height);
  if (block) {
    blockTimestamp = new Date(block.timestamp * 1000).toISOString();
  } else {
    logger.warn({ height: status.block_height }, 'Could not fetch block for timestamp');
  }

  return {
    existence: {
      status: 'confirmed',
      blockHeight: status.block_height,
      blockTimestamp: blockTimestamp,
      blockId: status.block_indep_hash,
      confirmations: status.number_of_confirmations,
    },
    owner,
    metadata,
    rawTags,
    target: tx.target,
    anchor: tx.last_tx,
    format: tx.format,
    quantity: tx.quantity,
    reward: tx.reward,
    dataRoot: tx.data_root,
    signatureFromTx: tx.signature,
  };
}

/**
 * Fetch block info for a transaction by its ID. Used to resolve block details
 * for bundled data items via their root transaction.
 */
export async function fetchBlockInfo(
  txId: string
): Promise<{
  blockHeight: number;
  blockTimestamp: string | null;
  blockId: string;
  confirmations: number;
} | null> {
  const status = await getTransactionStatus(txId);
  if (!status) return null;

  let blockTimestamp: string | null = null;
  const block = await getBlock(status.block_height);
  if (block) {
    blockTimestamp = new Date(block.timestamp * 1000).toISOString();
  }

  return {
    blockHeight: status.block_height,
    blockTimestamp,
    blockId: status.block_indep_hash,
    confirmations: status.number_of_confirmations,
  };
}

function decodeB64Url(str: string): string {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return str;
  }
}
