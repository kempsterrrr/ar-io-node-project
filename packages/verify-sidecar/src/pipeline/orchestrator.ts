import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';
import { fetchMetadata } from './metadata.js';
import { checkIntegrity } from './integrity.js';
import type { VerificationResult, VerifyRequest } from '../types.js';

/**
 * Run the full verification pipeline for a transaction ID.
 * Phase 1: Steps 1 (metadata) and 2 (integrity/tier detection).
 */
export async function runVerification(request: VerifyRequest): Promise<VerificationResult> {
  const verificationId = `vrf_${nanoid(16)}`;
  const timestamp = new Date().toISOString();
  const { txId } = request;

  logger.info({ verificationId, txId }, 'Starting verification');

  // Step 1: Metadata, existence, and owner
  const metadataResult = await fetchMetadata(txId);

  if (!metadataResult || metadataResult.existence.status === 'not_found') {
    logger.info({ verificationId, txId }, 'Transaction not found');
    return buildNotFoundResult(verificationId, timestamp, txId, metadataResult);
  }

  // Step 2: Integrity check, tier detection, and bundle detection
  const integrityResult = await checkIntegrity(txId);

  // Merge content type: prefer raw headers, fall back to tag
  const contentType = integrityResult.rawContentType ?? metadataResult.metadata.contentType ?? null;
  const dataSize = integrityResult.rawContentLength ?? metadataResult.metadata.dataSize ?? null;

  const result: VerificationResult = {
    verificationId,
    timestamp,
    txId,
    tier: integrityResult.tier,
    existence: metadataResult.existence,
    owner: metadataResult.owner,
    integrity: integrityResult.integrity,
    metadata: {
      dataSize,
      contentType,
      tags: metadataResult.metadata.tags,
    },
    bundle: integrityResult.bundle,
    // Phase 2
    fileComparisons: [],
    receipt: {
      provided: false,
      signatureValid: null,
      receiptTimestamp: null,
      receiptOwner: null,
      ownerMatchesOnChain: null,
      receiptIdMatchesTxId: null,
      timestampPredatesBlock: null,
      turboStatus: null,
    },
    // Phase 3
    multiGateway: {
      enabled: false,
      totalQueried: 0,
      totalResponded: 0,
      totalAgreed: 0,
      consensusMet: false,
      gateways: [],
    },
    links: {
      dashboard: `/report/${verificationId}`,
      pdf: `/api/v1/verify/${verificationId}/pdf`,
      rawData: `https://arweave.net/${txId}`,
    },
  };

  logger.info(
    { verificationId, txId, tier: result.tier, existence: result.existence.status },
    'Verification complete'
  );

  return result;
}

function buildNotFoundResult(
  verificationId: string,
  timestamp: string,
  txId: string,
  metadataResult: Awaited<ReturnType<typeof fetchMetadata>>
): VerificationResult {
  return {
    verificationId,
    timestamp,
    txId,
    tier: 'basic',
    existence: metadataResult?.existence ?? {
      status: 'not_found',
      blockHeight: null,
      blockTimestamp: null,
      blockId: null,
      confirmations: null,
    },
    owner: metadataResult?.owner ?? {
      address: null,
      publicKey: null,
      signatureValid: null,
    },
    integrity: {
      status: 'unavailable',
      hash: null,
      onChainDigest: null,
      match: null,
      deepVerification: false,
    },
    metadata: metadataResult?.metadata ?? {
      dataSize: null,
      contentType: null,
      tags: [],
    },
    bundle: { isBundled: false, rootTransactionId: null },
    fileComparisons: [],
    receipt: {
      provided: false,
      signatureValid: null,
      receiptTimestamp: null,
      receiptOwner: null,
      ownerMatchesOnChain: null,
      receiptIdMatchesTxId: null,
      timestampPredatesBlock: null,
      turboStatus: null,
    },
    multiGateway: {
      enabled: false,
      totalQueried: 0,
      totalResponded: 0,
      totalAgreed: 0,
      consensusMet: false,
      gateways: [],
    },
    links: {
      dashboard: null,
      pdf: null,
      rawData: null,
    },
  };
}
