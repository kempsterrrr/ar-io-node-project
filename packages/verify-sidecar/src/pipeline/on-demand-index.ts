import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { fetchWithTimeout } from '../utils/http.js';
import { headRawData } from '../gateway/client.js';

const POLL_INTERVAL_MS = 2000;

/**
 * Trigger on-demand indexing for a transaction via the gateway admin API.
 *
 * Calls PUT /ar-io/admin/queue-tx to queue the transaction for indexing,
 * then polls HEAD /raw/{txId} until the x-ar-io-digest header appears
 * (indicating the data has been indexed and verified).
 *
 * Returns true if indexing completed, false if it timed out or failed.
 */
export async function triggerIndexing(txId: string): Promise<boolean> {
  if (!config.ON_DEMAND_INDEX_ENABLED || !config.GATEWAY_ADMIN_API_KEY) {
    logger.warn('On-demand indexing not enabled or admin API key not configured');
    return false;
  }

  const baseUrl = config.GATEWAY_URL.replace(/\/$/, '');
  const timeoutMs = config.ON_DEMAND_INDEX_TIMEOUT_MS;

  try {
    // Queue the transaction for indexing
    const queueRes = await fetchWithTimeout(`${baseUrl}/ar-io/admin/queue-tx`, 10000, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.GATEWAY_ADMIN_API_KEY}`,
      },
      body: JSON.stringify({ id: txId }),
    });

    if (!queueRes.ok) {
      logger.warn({ status: queueRes.status, txId }, 'Failed to queue transaction for indexing');
      return false;
    }

    logger.info({ txId }, 'Transaction queued for indexing, polling for completion');

    // Poll until indexed or timeout
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const headers = await headRawData(txId);
      if (headers?.digest) {
        logger.info({ txId, digest: headers.digest }, 'Transaction indexed successfully');
        return true;
      }
      await sleep(POLL_INTERVAL_MS);
    }

    logger.warn({ txId, timeoutMs }, 'On-demand indexing timed out');
    return false;
  } catch (error) {
    logger.error({ error, txId }, 'On-demand indexing failed');
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
