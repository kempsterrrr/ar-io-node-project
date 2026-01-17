/**
 * Webhook route handler.
 *
 * POST /webhook - Receive gateway index notifications
 */

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import {
  processWebhook,
  processWebhookBatch,
  type WebhookPayload,
} from '../services/webhook.service.js';

const webhook = new Hono();

/**
 * POST /webhook
 *
 * Receive webhook notifications from the AR.IO gateway
 * when pHash-tagged transactions are indexed.
 *
 * The gateway sends notifications when transactions matching
 * the WEBHOOK_INDEX_FILTER are indexed.
 *
 * Expected payload (single):
 * {
 *   tx_id: "abc123...",
 *   tags: [{ name: "pHash", value: "..." }, ...],
 *   owner: "xyz789...",
 *   block_height: 1500000
 * }
 *
 * Or batch (array):
 * [{ tx_id: "...", ... }, { tx_id: "...", ... }]
 */
webhook.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // Handle both single and batch payloads
    if (Array.isArray(body)) {
      // Batch processing
      const results = await processWebhookBatch(body as WebhookPayload[]);

      const indexed = results.filter((r) => r.action === 'indexed').length;
      const errors = results.filter((r) => r.action === 'error').length;

      return c.json({
        success: errors === 0,
        data: {
          total: results.length,
          indexed,
          skipped: results.filter((r) => r.action === 'skipped').length,
          errors,
        },
        results: results.map((r) => ({
          txId: r.txId,
          action: r.action,
          reason: r.reason,
        })),
      });
    } else {
      // Single payload
      const result = await processWebhook(body as WebhookPayload);

      const statusCode = result.success ? 200 : 400;

      return c.json(
        {
          success: result.success,
          data: {
            txId: result.txId,
            action: result.action,
            reason: result.reason,
          },
        },
        statusCode
      );
    }
  } catch (error) {
    logger.error({ error }, 'Webhook request failed');

    // Return 200 even on error to prevent gateway retries
    // Log the error for debugging but acknowledge receipt
    return c.json({
      success: false,
      error: 'Failed to process webhook',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /webhook
 *
 * Health check for webhook endpoint.
 * Can be used by gateway to verify the endpoint is reachable.
 */
webhook.get('/', (c) => {
  return c.json({
    status: 'ready',
    endpoint: '/webhook',
    accepts: ['POST'],
    description: 'AR.IO gateway webhook receiver for pHash-tagged transactions',
  });
});

export default webhook;
