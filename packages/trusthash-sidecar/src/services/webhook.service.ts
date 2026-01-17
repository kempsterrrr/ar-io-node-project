/**
 * Webhook service for processing gateway notifications.
 *
 * Handles incoming webhooks from the AR.IO gateway when
 * pHash-tagged transactions are indexed.
 */

import { logger } from '../utils/logger.js';
import { insertManifest, getManifestByTxId } from '../db/index.js';
import { parsePHash } from '../utils/bit-vector.js';
import { binaryStringToFloatArray } from '../utils/bit-vector.js';
import { buildArnsUrl, isArnsConfigured } from './arns.service.js';

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
  const tag = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
  return tag?.value;
}

/**
 * Process a webhook payload from the gateway.
 *
 * Expected payload structure (based on gateway webhook format):
 * {
 *   tx_id: "abc123...",
 *   tags: [
 *     { name: "pHash", value: "a5a5a5a5a5a5a5a5" },
 *     { name: "Content-Type", value: "application/c2pa+json" },
 *     { name: "ArNS-Undername", value: "th-abc123" }
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
  const blockHeight = payload.block_height || payload.height;
  const blockTimestamp = payload.block_timestamp || payload.timestamp;

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

    // Extract required tags
    const pHashValue = getTagValue(tags, 'pHash');
    if (!pHashValue) {
      logger.debug({ txId }, 'No pHash tag found, skipping');
      return {
        success: true,
        action: 'skipped',
        txId,
        reason: 'No pHash tag',
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
    const contentType = getTagValue(tags, 'Content-Type') || 'application/c2pa';
    const arnsUndername = getTagValue(tags, 'ArNS-Undername') || `indexed-${txId.slice(0, 8)}`;
    const appName = getTagValue(tags, 'App-Name');

    // Build ArNS URL using underscore format: undername_rootname.arweave.net
    // If ArNS is configured, use our root name; otherwise use placeholder
    const arnsFullUrl = isArnsConfigured()
      ? buildArnsUrl(arnsUndername)
      : `https://${arnsUndername}_unknown.arweave.net`;

    // Index the manifest
    await insertManifest({
      manifestTxId: txId,
      arnsUndername,
      arnsFullUrl,
      originalHash: '', // Not available from webhook
      contentType,
      phash: phashFloats,
      hasPriorManifest: false, // Unknown from webhook
      claimGenerator: appName || 'External',
      ownerAddress: owner || 'unknown',
      blockHeight,
      blockTimestamp: blockTimestamp ? new Date(blockTimestamp * 1000) : undefined,
    });

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
