/**
 * Webhook service for processing gateway notifications.
 *
 * Handles incoming webhooks from the AR.IO gateway when
 * manifest sidecar transactions are indexed.
 */

import { logger } from '../utils/logger.js';
import { upsertManifestArtifactWithBindings, getManifestByTxId } from '../db/index.js';
import { parsePHash, binaryStringToFloatArray } from '../utils/bit-vector.js';
import { config } from '../config.js';
import {
  PROTOCOL_NAME,
  TAG_PROTOCOL,
  TAG_STORAGE_MODE,
  TAG_MANIFEST_ID,
  TAG_MANIFEST_STORE_HASH,
  TAG_MANIFEST_REPO_URL,
  TAG_MANIFEST_FETCH_URL,
  TAG_ASSET_CONTENT_TYPE,
  TAG_SOFT_BINDING_ALG,
  TAG_SOFT_BINDING_VALUE,
  TAG_CLAIM_GENERATOR,
  ALG_PHASH,
} from '@ar-io/c2pa-protocol';

/**
 * Webhook payload tag
 */
interface WebhookTag {
  name: string;
  value: string;
}

/**
 * Webhook payload from gateway
 */
export interface WebhookPayload {
  /** Transaction ID */
  tx_id?: string;
  id?: string;
  /** Tags array */
  tags?: WebhookTag[];
  /** Owner address */
  owner?: string;
  owner_address?: string;
  /** Block height */
  block_height?: number;
  height?: number;
  /** Block timestamp */
  block_timestamp?: number;
  timestamp?: number;
}

/**
 * Result of processing a webhook
 */
export interface WebhookResult {
  success: boolean;
  action: 'indexed' | 'skipped' | 'error';
  txId?: string;
  reason?: string;
}

/**
 * Extract a tag value from the tags array (case-insensitive).
 */
function getTagValue(tags: WebhookTag[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return tags.find((t) => t.name.toLowerCase() === lower)?.value;
}

/**
 * Process a webhook payload from the gateway.
 *
 * Required tags (Protocol: C2PA-Manifest-Proof schema):
 * - Protocol=C2PA-Manifest-Proof
 * - C2PA-Storage-Mode=full|manifest|proof
 * - C2PA-Manifest-ID (URN)
 * - C2PA-Soft-Binding-Alg + C2PA-Soft-Binding-Value
 *
 * For proof mode, also required:
 * - C2PA-Manifest-Fetch-URL
 * - C2PA-Manifest-Store-Hash (base64url SHA-256, used for digest verification)
 */
export async function processWebhook(payload: WebhookPayload): Promise<WebhookResult> {
  const txId = payload.tx_id || payload.id;
  const tags = payload.tags || [];
  const owner = payload.owner || payload.owner_address;
  const blockHeight = payload.block_height ?? payload.height;
  const blockTimestamp = payload.block_timestamp ?? payload.timestamp;

  if (!txId) {
    return {
      success: false,
      action: 'error',
      reason: 'Missing transaction ID in payload',
    };
  }

  logger.info({ txId, tagCount: tags.length }, 'Processing webhook');

  try {
    const existing = await getManifestByTxId(txId);
    if (existing) {
      logger.debug({ txId }, 'Manifest already indexed, skipping');
      return { success: true, action: 'skipped', txId, reason: 'Already indexed' };
    }

    // Extract tags
    const protocolTag = getTagValue(tags, TAG_PROTOCOL);
    const storageModeTag = getTagValue(tags, TAG_STORAGE_MODE);
    const manifestIdTag = getTagValue(tags, TAG_MANIFEST_ID);
    const manifestStoreHash = getTagValue(tags, TAG_MANIFEST_STORE_HASH);
    const repoUrl = getTagValue(tags, TAG_MANIFEST_REPO_URL);
    const fetchUrl = getTagValue(tags, TAG_MANIFEST_FETCH_URL);
    const assetContentType = getTagValue(tags, TAG_ASSET_CONTENT_TYPE);
    const contentTypeTag = getTagValue(tags, 'Content-Type');
    const claimGenerator = getTagValue(tags, TAG_CLAIM_GENERATOR);
    const softBindingAlg = getTagValue(tags, TAG_SOFT_BINDING_ALG);
    const softBindingValue = getTagValue(tags, TAG_SOFT_BINDING_VALUE);

    // Require Protocol tag
    if (protocolTag !== PROTOCOL_NAME) {
      logger.debug({ txId, protocolTag }, 'Not a C2PA-Manifest-Proof transaction, skipping');
      return { success: true, action: 'skipped', txId, reason: 'Missing Protocol tag' };
    }

    if (!manifestIdTag) {
      logger.debug({ txId }, 'Missing C2PA-Manifest-ID tag, skipping');
      return { success: true, action: 'skipped', txId, reason: 'Missing required tags' };
    }

    if (!storageModeTag) {
      logger.debug({ txId }, 'Missing C2PA-Storage-Mode tag, skipping');
      return { success: true, action: 'skipped', txId, reason: 'Missing required tags' };
    }

    // Resolve artifact kind from storage mode
    const mode = storageModeTag.trim().toLowerCase();
    const artifactKind: 'manifest-store' | 'proof-locator' | null =
      mode === 'full' || mode === 'manifest'
        ? 'manifest-store'
        : mode === 'proof'
          ? 'proof-locator'
          : null;

    if (!artifactKind) {
      logger.debug({ txId, storageModeTag }, 'Unsupported storage mode, skipping');
      return { success: true, action: 'skipped', txId, reason: 'Unsupported storage mode' };
    }

    if (artifactKind === 'proof-locator' && !config.ENABLE_PROOF_LOCATOR_ARTIFACTS) {
      logger.debug({ txId }, 'Proof-locator artifact indexing disabled');
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'Proof-locator artifacts are disabled',
      };
    }

    // Proof-locator requires fetch URL + store hash for digest verification
    if (artifactKind === 'proof-locator' && (!fetchUrl || !manifestStoreHash)) {
      logger.debug({ txId, fetchUrl, manifestStoreHash }, 'Missing required proof-locator tags');
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'Missing required proof-locator tags',
      };
    }

    // Require soft binding
    if (!softBindingAlg || !softBindingValue) {
      logger.debug({ txId }, 'Missing soft binding tags, skipping');
      return { success: true, action: 'skipped', txId, reason: 'Missing soft binding tags' };
    }

    if (softBindingAlg !== ALG_PHASH) {
      logger.debug({ txId, softBindingAlg }, 'Unsupported soft binding algorithm');
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'Unsupported soft binding algorithm',
      };
    }

    // Derive pHash from soft binding value (base64-encoded 8-byte hash)
    let phashFloats: number[] | null = null;
    try {
      const pHashHex = Buffer.from(softBindingValue, 'base64').toString('hex');
      const binary = parsePHash(pHashHex);
      phashFloats = binaryStringToFloatArray(binary);
    } catch (error) {
      logger.warn({ txId, softBindingValue, error }, 'Invalid pHash in soft binding value');
      return {
        success: false,
        action: 'error',
        txId,
        reason: `Invalid pHash in soft binding value`,
      };
    }

    const contentType = assetContentType || contentTypeTag || 'application/c2pa';

    await upsertManifestArtifactWithBindings(
      {
        manifestTxId: txId,
        manifestId: manifestIdTag,
        artifactKind,
        remoteManifestUrl: fetchUrl || null,
        manifestDigestAlg: manifestStoreHash ? 'SHA-256' : null,
        manifestDigestB64: manifestStoreHash || null,
        repoUrl: repoUrl || null,
        fetchUrl: fetchUrl || null,
        originalHash: null,
        contentType,
        phash: phashFloats,
        hasPriorManifest: false,
        claimGenerator: claimGenerator || 'unknown',
        ownerAddress: owner || 'unknown',
        blockHeight,
        blockTimestamp: blockTimestamp ? new Date(blockTimestamp * 1000) : undefined,
      },
      [{ alg: softBindingAlg, valueB64: softBindingValue, scopeJson: null }]
    );

    logger.info({ txId, artifactKind, owner, blockHeight }, 'Manifest indexed from webhook');

    return { success: true, action: 'indexed', txId };
  } catch (error) {
    logger.error({ error, txId }, 'Failed to process webhook');
    return { success: false, action: 'error', txId, reason: (error as Error).message };
  }
}

/**
 * Process multiple webhooks in batch.
 */
export async function processWebhookBatch(payloads: WebhookPayload[]): Promise<WebhookResult[]> {
  logger.info({ count: payloads.length }, 'Processing webhook batch');

  const results: WebhookResult[] = [];

  for (const payload of payloads) {
    const result = await processWebhook(payload);
    results.push(result);
  }

  const indexed = results.filter((r) => r.action === 'indexed').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;
  const errors = results.filter((r) => r.action === 'error').length;

  logger.info({ total: payloads.length, indexed, skipped, errors }, 'Webhook batch complete');

  return results;
}
