import { headRawData } from '../gateway/client.js';
import type { VerificationResult } from '../types.js';

interface IntegrityResult {
  tier: VerificationResult['tier'];
  integrity: VerificationResult['integrity'];
  bundle: VerificationResult['bundle'];
  /** Content type from raw data headers (may override metadata) */
  rawContentType: string | null;
  /** Content length from raw data headers */
  rawContentLength: number | null;
}

/**
 * Pipeline Step 2: Check data integrity via HEAD /raw/{txId}.
 * Determines verification tier based on presence of x-ar-io-digest header.
 * Detects bundle membership via x-ar-io-root-transaction-id header.
 */
export async function checkIntegrity(txId: string): Promise<IntegrityResult> {
  const headers = await headRawData(txId);

  if (!headers) {
    // Gateway request failed entirely — degrade to basic
    return {
      tier: 'basic',
      integrity: {
        status: 'unavailable',
        hash: null,
        onChainDigest: null,
        match: null,
        deepVerification: false,
      },
      bundle: {
        isBundled: false,
        rootTransactionId: null,
      },
      rawContentType: null,
      rawContentLength: null,
    };
  }

  const hasDigest = !!headers.digest;
  const isBundled = !!headers.rootTransactionId && headers.rootTransactionId !== txId;

  if (hasDigest) {
    return {
      tier: 'full',
      integrity: {
        status: 'verified',
        hash: headers.digest,
        onChainDigest: headers.digest,
        match: true,
        deepVerification: false,
      },
      bundle: {
        isBundled,
        rootTransactionId: isBundled ? headers.rootTransactionId : null,
      },
      rawContentType: headers.contentType,
      rawContentLength: headers.contentLength,
    };
  }

  return {
    tier: 'basic',
    integrity: {
      status: 'unavailable',
      hash: null,
      onChainDigest: null,
      match: null,
      deepVerification: false,
    },
    bundle: {
      isBundled,
      rootTransactionId: isBundled ? headers.rootTransactionId : null,
    },
    rawContentType: headers.contentType,
    rawContentLength: headers.contentLength,
  };
}
