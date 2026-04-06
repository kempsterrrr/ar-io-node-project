import { headRawData, getRawData } from '../gateway/client.js';
import { sha256B64Url, ownerToAddress } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import type { VerificationResult } from '../types.js';

export interface IntegrityResult {
  integrity: VerificationResult['integrity'];
  bundle: VerificationResult['bundle'];
  ownerFromHeaders: {
    address: string | null;
    publicKey: string | null;
    signaturePresent: boolean;
    signatureType: number | null;
    addressVerified: boolean | null;
  };
  gatewayAssessment: VerificationResult['gatewayAssessment'];
  /** Content type from raw data headers (may override metadata) */
  rawContentType: string | null;
  /** Content length from raw data headers */
  rawContentLength: number | null;
  /** Raw data bytes downloaded for independent hash (reused for signature verification) */
  rawDataBytes: Buffer | null;
  /** Base64url-encoded signature from gateway headers */
  signatureB64Url: string | null;
  /** Anchor from gateway headers (base64url) */
  anchorB64Url: string | null;
  /** Tags parsed from x-arweave-tag-* headers (decoded, not base64url) */
  tagsFromHeaders: Array<{ name: string; value: string }>;
}

const EMPTY_OWNER = {
  address: null,
  publicKey: null,
  signaturePresent: false,
  signatureType: null,
  addressVerified: null,
};

const EMPTY_ASSESSMENT: VerificationResult['gatewayAssessment'] = {
  verified: null,
  stable: null,
  trusted: null,
  hops: null,
  dataId: null,
};

/**
 * Pipeline Step 2: Check data integrity via HEAD /raw/{txId}.
 * - Determines verification tier based on presence of x-ar-io-digest header.
 * - Performs independent hash verification by downloading and hashing raw data.
 * - Extracts signature presence and verifies owner address derivation.
 * - Captures gateway trust assessment headers.
 * - Detects bundle membership via x-ar-io-root-transaction-id header.
 */
export async function checkIntegrity(txId: string): Promise<IntegrityResult> {
  const headers = await headRawData(txId);

  if (!headers) {
    return {
      integrity: {
        status: 'unavailable',
        hash: null,
        independentHash: null,
        match: null,
        independentlyVerified: false,
        independentSkipReason: 'Gateway request failed',
      },
      bundle: { isBundled: false, rootTransactionId: null },
      ownerFromHeaders: EMPTY_OWNER,
      gatewayAssessment: EMPTY_ASSESSMENT,
      rawContentType: null,
      rawContentLength: null,
      rawDataBytes: null,
      signatureB64Url: null,
      anchorB64Url: null,
      tagsFromHeaders: [],
    };
  }

  const hasDigest = !!headers.digest;
  const isBundled = !!headers.rootTransactionId && headers.rootTransactionId !== txId;

  // Owner address verification: derive address from public key via SHA-256
  let ownerAddress = headers.ownerAddress;
  let addressVerified: boolean | null = null;
  if (headers.owner) {
    try {
      const derived = ownerToAddress(headers.owner);
      if (ownerAddress) {
        // Both provided: verify they match
        addressVerified = derived === ownerAddress;
        if (!addressVerified) {
          logger.warn(
            { txId, derived, expected: ownerAddress },
            'Owner address mismatch — derived address does not match header'
          );
        }
      } else {
        // Only pubkey provided: derive the address ourselves and mark verified
        ownerAddress = derived;
        addressVerified = true;
      }
    } catch {
      addressVerified = null;
    }
  }

  const ownerFromHeaders = {
    address: ownerAddress,
    publicKey: headers.owner,
    signaturePresent: !!headers.signature,
    signatureType: headers.signatureType,
    addressVerified,
  };

  const gatewayAssessment: VerificationResult['gatewayAssessment'] = {
    verified: headers.arIoVerified,
    stable: headers.arIoStable,
    trusted: headers.arIoTrusted,
    hops: headers.arIoHops,
    dataId: headers.arIoDataId,
  };

  const bundle = {
    isBundled,
    rootTransactionId: isBundled ? headers.rootTransactionId : null,
  };

  // Always try to download raw data and compute our own SHA-256,
  // regardless of whether the gateway has a digest header.
  let independentHash: string | null = null;
  let independentlyVerified = false;
  let independentSkipReason: string | null = null;

  const rawData = await getRawData(txId, headers.contentLength);
  if (rawData) {
    independentHash = sha256B64Url(rawData);
    independentlyVerified = true;
    logger.info(
      { txId, gatewayHash: headers.digest, independentHash, hasDigest },
      'Independent hash computed'
    );
  } else if (headers.contentLength && headers.contentLength > 100 * 1024 * 1024) {
    independentSkipReason = `File too large for verification (${(headers.contentLength / 1024 / 1024).toFixed(0)} MB). Maximum supported size is 100 MB.`;
  } else {
    independentSkipReason = 'Raw data unavailable for download';
  }

  // If gateway has a digest, compare. If not, our independent hash still stands on its own.
  const hashMatch =
    independentHash && hasDigest
      ? headers.digest === independentHash
      : independentHash
        ? true
        : null;

  const integrityStatus = hasDigest || independentlyVerified ? 'verified' : 'unavailable';

  return {
    integrity: {
      status: integrityStatus,
      hash: headers.digest,
      independentHash,
      match: hashMatch,
      independentlyVerified,
      independentSkipReason,
    },
    bundle,
    ownerFromHeaders,
    gatewayAssessment,
    rawContentType: headers.contentType,
    rawContentLength: headers.contentLength,
    rawDataBytes: rawData,
    signatureB64Url: headers.signature,
    anchorB64Url: headers.anchor,
    tagsFromHeaders: headers.tags,
  };
}
