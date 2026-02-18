/**
 * Webhook service for processing gateway notifications.
 *
 * Handles incoming webhooks from the AR.IO gateway when
 * manifest sidecar transactions are indexed.
 */

import { logger } from '../utils/logger.js';
import { insertManifestWithBindings, getManifestByTxId } from '../db/index.js';
import { parsePHash } from '../utils/bit-vector.js';
import { binaryStringToFloatArray } from '../utils/bit-vector.js';
import { SOFT_BINDING_ALG_ID } from './softbinding.service.js';

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
 * Extract a tag value from the tags array.
 */
function getTagValue(tags: WebhookTag[], name: string): string | undefined {
  return getTagValues(tags, name)[0];
}

function getTagValues(tags: WebhookTag[], name: string): string[] {
  return tags.filter((t) => t.name.toLowerCase() === name.toLowerCase()).map((t) => t.value);
}

function getTagValueByNames(tags: WebhookTag[], names: string[]): string | undefined {
  return getTagValuesByNames(tags, names)[0];
}

function getTagValuesByNames(tags: WebhookTag[], names: string[]): string[] {
  const normalized = new Set(names.map((name) => name.toLowerCase()));
  return tags.filter((t) => normalized.has(t.name.toLowerCase())).map((t) => t.value);
}

/**
 * Process a webhook payload from the gateway.
 *
 * Expected payload structure (based on gateway webhook format).
 * Required tags for indexing:
 * - Content-Type=application/c2pa
 * - Manifest-Type=sidecar
 * - C2PA-Manifest-Id or C2PA-Manifest-ID (URN, e.g. urn:uuid:...)
 * - C2PA-SoftBinding-Alg or C2PA-Soft-Binding-Alg (one per binding)
 * - C2PA-SoftBinding-Value or C2PA-Soft-Binding-Value (one per binding, base64)
 * - pHash (hex or binary, used for similarity search)
 * {
 *   tx_id: "abc123...",
 *   tags: [
 *     { name: "pHash", value: "a5a5a5a5a5a5a5a5" },
 *     { name: "Content-Type", value: "application/c2pa" },
 *   ],
 *   owner: "xyz789...",
 *   block_height: 1500000,
 *   block_timestamp: 1704067200
 * }
 */
export async function processWebhook(payload: WebhookPayload): Promise<WebhookResult> {
  // Normalize field names (gateway may use different formats)
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
    // Check if we already have this manifest
    const existing = await getManifestByTxId(txId);
    if (existing) {
      logger.debug({ txId }, 'Manifest already indexed, skipping');
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'Already indexed',
      };
    }

    // Extract required tags (tag-only indexing)
    const contentTypeTag = getTagValue(tags, 'Content-Type');
    const manifestTypeTag = getTagValue(tags, 'Manifest-Type');
    const manifestIdTag = getTagValueByNames(tags, ['C2PA-Manifest-Id', 'C2PA-Manifest-ID']);
    const pHashValue = getTagValue(tags, 'pHash');
    const softBindingAlgs = getTagValuesByNames(tags, [
      'C2PA-SoftBinding-Alg',
      'C2PA-Soft-Binding-Alg',
    ]);
    const softBindingValues = getTagValuesByNames(tags, [
      'C2PA-SoftBinding-Value',
      'C2PA-Soft-Binding-Value',
    ]);
    const softBindingScopes = getTagValuesByNames(tags, [
      'C2PA-SoftBinding-Scope',
      'C2PA-Soft-Binding-Scope',
    ]);

    if (!contentTypeTag || !manifestTypeTag || !manifestIdTag || !pHashValue) {
      logger.debug(
        {
          txId,
          contentTypeTag,
          manifestTypeTag,
          manifestIdTag,
          pHashValue,
        },
        'Missing required tags, skipping'
      );
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'Missing required tags',
      };
    }

    if (contentTypeTag !== 'application/c2pa' || manifestTypeTag !== 'sidecar') {
      logger.debug({ txId, contentTypeTag, manifestTypeTag }, 'Non-sidecar manifest, skipping');
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'Non-sidecar manifest',
      };
    }

    if (softBindingAlgs.length === 0 || softBindingValues.length === 0) {
      logger.debug({ txId }, 'Missing soft binding tags, skipping');
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'Missing soft binding tags',
      };
    }

    if (softBindingAlgs.length !== softBindingValues.length) {
      logger.warn(
        { txId, algCount: softBindingAlgs.length, valueCount: softBindingValues.length },
        'Soft binding tag counts mismatch, skipping'
      );
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'Soft binding tag counts mismatch',
      };
    }

    if (!softBindingAlgs.some((alg) => alg === SOFT_BINDING_ALG_ID)) {
      logger.debug({ txId, softBindingAlgs }, 'No supported soft binding algorithm present');
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'Unsupported soft binding algorithm',
      };
    }

    // Parse pHash to float array
    let phashFloats: number[];
    try {
      const binary = parsePHash(pHashValue);
      phashFloats = binaryStringToFloatArray(binary);
    } catch (error) {
      logger.warn({ txId, pHashValue, error }, 'Invalid pHash format');
      return {
        success: false,
        action: 'error',
        txId,
        reason: `Invalid pHash format: ${pHashValue}`,
      };
    }

    // Extract optional tags
    const originalContentType = getTagValue(tags, 'Original-Content-Type');
    const contentType = originalContentType || contentTypeTag;
    const appName = getTagValue(tags, 'App-Name');
    const manifestId = manifestIdTag;

    // Index the manifest and bindings together
    await insertManifestWithBindings(
      {
        manifestTxId: txId,
        manifestId,
        originalHash: null,
        contentType,
        phash: phashFloats,
        hasPriorManifest: false, // Unknown from webhook
        claimGenerator: appName || 'External',
        ownerAddress: owner || 'unknown',
        blockHeight,
        blockTimestamp: blockTimestamp ? new Date(blockTimestamp * 1000) : undefined,
      },
      softBindingAlgs.map((alg, index) => {
        const valueB64 = softBindingValues[index];
        const scopeRaw = softBindingScopes[index];
        let scopeJson: string | null = null;
        if (scopeRaw) {
          try {
            scopeJson = JSON.stringify(JSON.parse(scopeRaw));
          } catch {
            scopeJson = JSON.stringify(scopeRaw);
          }
        }
        return { alg, valueB64, scopeJson };
      })
    );

    logger.info(
      {
        txId,
        pHash: pHashValue,
        owner,
        blockHeight,
      },
      'Manifest indexed from webhook'
    );

    return {
      success: true,
      action: 'indexed',
      txId,
    };
  } catch (error) {
    logger.error({ error, txId }, 'Failed to process webhook');
    return {
      success: false,
      action: 'error',
      txId,
      reason: (error as Error).message,
    };
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
