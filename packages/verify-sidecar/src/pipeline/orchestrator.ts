import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';
import { verifyDataItemSignature, verifyTransactionSignature } from '../utils/crypto.js';
import { fetchMetadata, fetchBlockInfo } from './metadata.js';
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

  const sigResult = attemptSignatureVerification({
    signatureB64Url: integrityResult.signatureB64Url ?? (metadataResult.signatureFromTx || null),
    ownerB64Url: integrityResult.ownerFromHeaders.publicKey ?? metadataResult.owner.publicKey,
    anchorB64Url: integrityResult.anchorB64Url ?? metadataResult.anchor,
    targetB64Url: metadataResult.target,
    rawTags: metadataResult.rawTags,
    rawDataBytes: integrityResult.rawDataBytes,
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
      tags: metadataResult.metadata.tags,
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
  signatureB64Url: string | null;
  ownerB64Url: string | null;
  anchorB64Url: string;
  targetB64Url: string;
  rawTags: Array<{ name: string; value: string }>;
  rawDataBytes: Buffer | null;
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

    if (isL1Transaction) {
      if (format === 1 && !rawDataBytes) {
        return { signatureValid: null, signatureSkipReason: 'Format 1 requires raw data' };
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
        return { signatureValid: null, signatureSkipReason: 'Raw data unavailable' };
      }
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

function buildPartialResult(
  verificationId: string,
  timestamp: string,
  txId: string,
  ir: IntegrityResult
): VerificationResult {
  const hashAvailable = ir.integrity.independentlyVerified;
  return {
    verificationId,
    timestamp,
    txId,
    level: hashAvailable ? 2 : 1,
    existence: {
      status: 'pending',
      blockHeight: null,
      blockTimestamp: null,
      blockId: null,
      confirmations: null,
    },
    authenticity: {
      status: hashAvailable ? 'hash_verified' : 'unverified',
      signatureValid: null,
      signatureSkipReason: 'Metadata not yet indexed',
      dataHash: ir.integrity.independentHash,
      gatewayHash: ir.integrity.hash,
      hashMatch: ir.integrity.match,
    },
    owner: {
      address: ir.ownerFromHeaders.address,
      publicKey: ir.ownerFromHeaders.publicKey,
      addressVerified: ir.ownerFromHeaders.addressVerified,
    },
    metadata: { dataSize: ir.rawContentLength, contentType: ir.rawContentType, tags: [] },
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
