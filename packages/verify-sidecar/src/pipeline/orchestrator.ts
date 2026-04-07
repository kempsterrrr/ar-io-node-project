import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';
import {
  verifyDataItemSignature,
  verifyDataItemSignatureRaw,
  verifyTransactionSignature,
  bufferToBase64Url,
} from '../utils/crypto.js';
import { fetchMetadata, fetchBlockInfo } from './metadata.js';
import { getTransactionViaGraphQL } from '../gateway/client.js';
import { checkIntegrity, type IntegrityResult } from './integrity.js';
import type { VerificationResult, VerifyRequest } from '../types.js';

export async function runVerification(request: VerifyRequest): Promise<VerificationResult> {
  const verificationId = `vrf_${nanoid(16)}`;
  const timestamp = new Date().toISOString();
  const { txId } = request;

  logger.info({ verificationId, txId }, 'Starting verification');

  const metadataResult = await fetchMetadata(txId);
  const integrityResult = await checkIntegrity(txId);

  // No metadata and no raw data = not found
  if (!metadataResult || metadataResult.existence.status === 'not_found') {
    if (integrityResult.rawContentType || integrityResult.integrity.status === 'verified') {
      logger.info({ verificationId, txId }, 'Metadata not indexed but raw data available');
      return buildPartialResult(verificationId, timestamp, txId, integrityResult);
    }
    logger.info({ verificationId, txId }, 'Transaction not found');
    return buildNotFoundResult(verificationId, timestamp, txId);
  }

  // Reconcile existence for bundled data items
  let existence = metadataResult.existence;
  if (
    integrityResult.integrity.status === 'verified' &&
    existence.status === 'pending' &&
    integrityResult.bundle.isBundled &&
    integrityResult.bundle.rootTransactionId
  ) {
    const rootBlock = await fetchBlockInfo(integrityResult.bundle.rootTransactionId);
    existence = {
      status: 'confirmed',
      blockHeight: rootBlock?.blockHeight ?? null,
      blockTimestamp: rootBlock?.blockTimestamp ?? null,
      blockId: rootBlock?.blockId ?? null,
      confirmations: rootBlock?.confirmations ?? null,
    };
  } else if (integrityResult.integrity.status === 'verified' && existence.status === 'pending') {
    existence = { ...existence, status: 'confirmed' };
  }

  // Signature verification
  const isL1Transaction =
    metadataResult.format >= 1 && (metadataResult.reward !== '0' || metadataResult.dataRoot !== '');

  // Tag resolution priority:
  // 1. /tx/ tags (base64url-encoded, original order) — if /tx/ worked
  // 2. GraphQL tags (decoded UTF-8, original order) — reliable fallback
  // 3. /raw/ header tags (decoded UTF-8, ALPHABETICAL order) — last resort
  // Note: binary header (parsedHeader) has exact Avro bytes and bypasses tag encoding entirely
  let rawTags = metadataResult.rawTags;
  let displayTags = metadataResult.metadata.tags;

  if (rawTags.length === 0) {
    // Try GraphQL for correct tag order
    const gql = await getTransactionViaGraphQL(txId);
    if (gql && gql.tags.length > 0) {
      displayTags = gql.tags;
      rawTags = gql.tags.map((t) => ({
        name: bufferToBase64Url(Buffer.from(t.name, 'utf-8')),
        value: bufferToBase64Url(Buffer.from(t.value, 'utf-8')),
      }));
      logger.info({ txId, tagCount: rawTags.length }, 'Tags resolved via GraphQL');
    } else {
      // Final fallback: header tags (may have wrong order)
      displayTags = integrityResult.tagsFromHeaders;
      rawTags = integrityResult.tagsFromHeaders.map((t) => ({
        name: bufferToBase64Url(Buffer.from(t.name, 'utf-8')),
        value: bufferToBase64Url(Buffer.from(t.value, 'utf-8')),
      }));
    }
  }

  const sigResult = attemptSignatureVerification({
    parsedHeader: integrityResult.parsedHeader,
    signatureB64Url: integrityResult.signatureB64Url ?? (metadataResult.signatureFromTx || null),
    ownerB64Url: integrityResult.ownerFromHeaders.publicKey ?? metadataResult.owner.publicKey,
    anchorB64Url: integrityResult.anchorB64Url ?? metadataResult.anchor,
    targetB64Url: metadataResult.target,
    rawTags,
    rawDataBytes: integrityResult.rawDataBytes,
    rawContentLength: integrityResult.rawContentLength,
    signatureType: integrityResult.ownerFromHeaders.signatureType,
    isL1Transaction,
    format: metadataResult.format,
    quantity: metadataResult.quantity,
    reward: metadataResult.reward,
    dataRoot: metadataResult.dataRoot,
    dataSize: metadataResult.metadata.dataSize?.toString() ?? '0',
    txId,
    verificationId,
  });

  // Build unified authenticity result
  const signaturePassed = sigResult.signatureValid === true;
  const hashAvailable = integrityResult.integrity.independentlyVerified;
  const authenticityStatus: VerificationResult['authenticity']['status'] = signaturePassed
    ? 'signature_verified'
    : hashAvailable
      ? 'hash_verified'
      : 'unverified';

  const level: 1 | 2 | 3 = signaturePassed ? 3 : hashAvailable ? 2 : 1;

  const contentType = integrityResult.rawContentType ?? metadataResult.metadata.contentType ?? null;
  const dataSize = integrityResult.rawContentLength ?? metadataResult.metadata.dataSize ?? null;

  const result: VerificationResult = {
    verificationId,
    timestamp,
    txId,
    level,
    existence,
    authenticity: {
      status: authenticityStatus,
      signatureValid: sigResult.signatureValid,
      signatureSkipReason: sigResult.signatureSkipReason,
      dataHash: integrityResult.integrity.independentHash,
      gatewayHash: integrityResult.integrity.hash,
      hashMatch: integrityResult.integrity.match,
    },
    owner: {
      address: integrityResult.ownerFromHeaders.address ?? metadataResult.owner.address,
      publicKey: integrityResult.ownerFromHeaders.publicKey ?? metadataResult.owner.publicKey,
      addressVerified: integrityResult.ownerFromHeaders.addressVerified,
    },
    metadata: {
      dataSize,
      contentType,
      tags: displayTags.length > 0 ? displayTags : metadataResult.metadata.tags,
    },
    bundle: integrityResult.bundle,
    gatewayAssessment: {
      verified: integrityResult.gatewayAssessment.verified,
      stable: integrityResult.gatewayAssessment.stable,
      trusted: integrityResult.gatewayAssessment.trusted,
      hops: integrityResult.gatewayAssessment.hops,
    },
    links: {
      dashboard: `/report/${verificationId}`,
      pdf: `/api/v1/verify/${verificationId}/pdf`,
      rawData: `https://arweave.net/${txId}`,
    },
  };

  logger.info(
    { verificationId, txId, level, authenticity: authenticityStatus, existence: existence.status },
    'Verification complete'
  );

  return result;
}

// ---------------------------------------------------------------------------
// Signature verification helper (unchanged logic, same as before)
// ---------------------------------------------------------------------------

interface SigVerifyInput {
  parsedHeader: import('../utils/ans104-parser.js').ParsedDataItemHeader | null;
  signatureB64Url: string | null;
  ownerB64Url: string | null;
  anchorB64Url: string;
  targetB64Url: string;
  rawTags: Array<{ name: string; value: string }>;
  rawDataBytes: Buffer | null;
  rawContentLength: number | null;
  signatureType: number | null;
  isL1Transaction: boolean;
  format: number;
  quantity: string;
  reward: string;
  dataRoot: string;
  dataSize: string;
  txId: string;
  verificationId: string;
}

function attemptSignatureVerification(input: SigVerifyInput): {
  signatureValid: boolean | null;
  signatureSkipReason: string | null;
} {
  const {
    signatureB64Url,
    ownerB64Url,
    rawDataBytes,
    rawContentLength,
    signatureType,
    isL1Transaction,
    format,
    anchorB64Url,
    targetB64Url,
    rawTags,
    quantity,
    reward,
    dataRoot,
    dataSize,
    txId,
    verificationId,
  } = input;

  if (!signatureB64Url) {
    return { signatureValid: null, signatureSkipReason: 'No signature available' };
  }
  if (!ownerB64Url) {
    return { signatureValid: null, signatureSkipReason: 'No owner public key available' };
  }
  if (ownerB64Url.length < 100) {
    return {
      signatureValid: null,
      signatureSkipReason: 'Only wallet address available, full public key required',
    };
  }

  try {
    let valid: boolean;

    const sizeSkipMsg = rawContentLength && rawContentLength > 100 * 1024 * 1024
      ? `File too large for verification (${(rawContentLength / 1024 / 1024).toFixed(0)} MB). Maximum supported size is 100 MB.`
      : null;

    if (isL1Transaction) {
      if (format === 1 && !rawDataBytes) {
        return { signatureValid: null, signatureSkipReason: sizeSkipMsg ?? 'Raw data unavailable' };
      }
      valid = verifyTransactionSignature({
        format,
        signatureB64Url,
        ownerB64Url,
        targetB64Url,
        anchorB64Url,
        rawTags,
        quantity,
        reward,
        dataRoot,
        dataSize,
        data: rawDataBytes,
      });
    } else {
      if (!rawDataBytes) {
        return { signatureValid: null, signatureSkipReason: sizeSkipMsg ?? 'Raw data unavailable' };
      }

      // Prefer binary header (exact original bytes, 100% accurate)
      if (input.parsedHeader) {
        valid = verifyDataItemSignatureRaw({
          signatureType: input.parsedHeader.signatureType,
          signature: input.parsedHeader.signature,
          owner: input.parsedHeader.owner,
          target: input.parsedHeader.target,
          anchor: input.parsedHeader.anchor,
          rawTagBytes: input.parsedHeader.rawTagBytes,
          data: rawDataBytes,
        });
      } else {
        // Fallback: reconstruct from encoded tags (may have ordering issues)
        const sigType = signatureType ?? 1;
        if (sigType !== 1) {
          return {
            signatureValid: null,
            signatureSkipReason: `Unsupported signature type ${sigType}`,
          };
        }
        valid = verifyDataItemSignature({
          signatureType: sigType,
          signatureB64Url,
          ownerB64Url,
          targetB64Url,
          anchorB64Url,
          rawTags,
          data: rawDataBytes,
        });
      }
    }

    logger.info(
      { verificationId, txId, signatureValid: valid },
      'Signature verification completed'
    );
    return { signatureValid: valid, signatureSkipReason: null };
  } catch (error) {
    logger.error({ error, verificationId, txId }, 'Signature verification error');
    return {
      signatureValid: null,
      signatureSkipReason: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Result builders
// ---------------------------------------------------------------------------

async function buildPartialResult(
  verificationId: string,
  timestamp: string,
  txId: string,
  ir: IntegrityResult
): Promise<VerificationResult> {
  const hashAvailable = ir.integrity.independentlyVerified;

  // Resolve tags: try GraphQL (correct order) → fall back to headers (alphabetical)
  const gql = await getTransactionViaGraphQL(txId);
  let displayTags = ir.tagsFromHeaders;
  let headerTagsB64: Array<{ name: string; value: string }>;

  if (gql && gql.tags.length > 0) {
    displayTags = gql.tags;
    headerTagsB64 = gql.tags.map((t) => ({
      name: bufferToBase64Url(Buffer.from(t.name, 'utf-8')),
      value: bufferToBase64Url(Buffer.from(t.value, 'utf-8')),
    }));
    logger.info({ txId, tagCount: headerTagsB64.length }, 'Partial result: tags from GraphQL');
  } else {
    headerTagsB64 = ir.tagsFromHeaders.map((t) => ({
      name: bufferToBase64Url(Buffer.from(t.name, 'utf-8')),
      value: bufferToBase64Url(Buffer.from(t.value, 'utf-8')),
    }));
  }

  const canVerify = ir.parsedHeader
    ? !!ir.rawDataBytes
    : ir.signatureB64Url && ir.ownerFromHeaders.publicKey && ir.rawDataBytes && headerTagsB64.length > 0;

  const sigResult = canVerify
      ? attemptSignatureVerification({
          parsedHeader: ir.parsedHeader,
          signatureB64Url: ir.signatureB64Url,
          ownerB64Url: ir.ownerFromHeaders.publicKey,
          anchorB64Url: ir.anchorB64Url ?? '',
          targetB64Url: '',
          rawTags: headerTagsB64,
          rawDataBytes: ir.rawDataBytes,
          rawContentLength: ir.rawContentLength,
          signatureType: ir.ownerFromHeaders.signatureType,
          isL1Transaction: false,
          format: 1,
          quantity: '0',
          reward: '0',
          dataRoot: '',
          dataSize: '0',
          txId,
          verificationId,
        })
      : { signatureValid: null, signatureSkipReason: 'Metadata not yet indexed' };

  const signaturePassed = sigResult.signatureValid === true;
  const level: 1 | 2 | 3 = signaturePassed ? 3 : hashAvailable ? 2 : 1;
  const authenticityStatus: VerificationResult['authenticity']['status'] = signaturePassed
    ? 'signature_verified'
    : hashAvailable
      ? 'hash_verified'
      : 'unverified';

  return {
    verificationId,
    timestamp,
    txId,
    level,
    existence: {
      status: 'pending',
      blockHeight: null,
      blockTimestamp: null,
      blockId: null,
      confirmations: null,
    },
    authenticity: {
      status: authenticityStatus,
      signatureValid: sigResult.signatureValid,
      signatureSkipReason: sigResult.signatureSkipReason,
      dataHash: ir.integrity.independentHash,
      gatewayHash: ir.integrity.hash,
      hashMatch: ir.integrity.match,
    },
    owner: {
      address: ir.ownerFromHeaders.address,
      publicKey: ir.ownerFromHeaders.publicKey,
      addressVerified: ir.ownerFromHeaders.addressVerified,
    },
    metadata: { dataSize: ir.rawContentLength, contentType: ir.rawContentType, tags: displayTags },
    bundle: ir.bundle,
    gatewayAssessment: {
      verified: ir.gatewayAssessment.verified,
      stable: ir.gatewayAssessment.stable,
      trusted: ir.gatewayAssessment.trusted,
      hops: ir.gatewayAssessment.hops,
    },
    links: {
      dashboard: `/report/${verificationId}`,
      pdf: `/api/v1/verify/${verificationId}/pdf`,
      rawData: `https://arweave.net/${txId}`,
    },
  };
}

function buildNotFoundResult(
  verificationId: string,
  timestamp: string,
  txId: string
): VerificationResult {
  return {
    verificationId,
    timestamp,
    txId,
    level: 1,
    existence: {
      status: 'not_found',
      blockHeight: null,
      blockTimestamp: null,
      blockId: null,
      confirmations: null,
    },
    authenticity: {
      status: 'unverified',
      signatureValid: null,
      signatureSkipReason: 'Transaction not found',
      dataHash: null,
      gatewayHash: null,
      hashMatch: null,
    },
    owner: { address: null, publicKey: null, addressVerified: null },
    metadata: { dataSize: null, contentType: null, tags: [] },
    bundle: { isBundled: false, rootTransactionId: null },
    gatewayAssessment: { verified: null, stable: null, trusted: null, hops: null },
    links: { dashboard: null, pdf: null, rawData: null },
  };
}
