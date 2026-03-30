import { createHash } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { bufferToBase64Url } from '../utils/crypto.js';
import type { VerificationResult } from '../types.js';

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

/**
 * Pipeline Step 5: Compare uploaded files against the on-chain digest.
 *
 * Computes SHA-256 of each uploaded file and compares against the
 * x-ar-io-digest header from the gateway. Only available at Tier 1
 * (when the gateway has indexed and verified the data).
 */
export function compareFiles(
  files: UploadedFile[],
  onChainDigest: string | null,
  tier: 'full' | 'basic'
): VerificationResult['fileComparisons'] {
  if (!files || files.length === 0) {
    return [];
  }

  if (tier === 'basic' || !onChainDigest) {
    logger.info('File comparison skipped — data not indexed by gateway (Tier 2)');
    return files.map((file) => ({
      filename: file.originalname,
      fileHash: computeFileHash(file.buffer),
      onChainHash: 'unavailable',
      match: false,
    }));
  }

  return files.map((file) => {
    const fileHash = computeFileHash(file.buffer);
    const match = fileHash === onChainDigest;
    logger.info({ filename: file.originalname, fileHash, onChainDigest, match }, 'File comparison');
    return {
      filename: file.originalname,
      fileHash,
      onChainHash: onChainDigest,
      match,
    };
  });
}

/**
 * Compute SHA-256 hash of file data, formatted to match the x-ar-io-digest header.
 * The gateway returns: "sha256-b64:<base64url-hash>"
 */
function computeFileHash(data: Buffer): string {
  const hash = createHash('sha256').update(data).digest();
  return `sha256-b64:${bufferToBase64Url(hash)}`;
}
