import { getTransaction, getTransactionStatus, getBlock } from '../gateway/client.js';
import { ownerToAddress } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import type { VerificationResult } from '../types.js';

interface MetadataResult {
  existence: VerificationResult['existence'];
  owner: VerificationResult['owner'];
  metadata: VerificationResult['metadata'];
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
        signatureValid: null,
      },
      metadata: {
        dataSize: null,
        contentType: null,
        tags: [],
      },
    };
  }

  // Decode tags from base64url
  const tags = tx.tags.map((tag) => ({
    name: decodeB64Url(tag.name),
    value: decodeB64Url(tag.value),
  }));

  const contentTypeTag = tags.find((t) => t.name.toLowerCase() === 'content-type');

  const owner: VerificationResult['owner'] = {
    address: ownerToAddress(tx.owner),
    publicKey: tx.owner,
    signatureValid: null, // Phase 2: signature verification
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
