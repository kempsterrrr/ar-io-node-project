import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { fetchWithTimeout } from '../utils/http.js';
import type {
  GatewayTransaction,
  GatewayTransactionStatus,
  GatewayBlock,
  RawDataHeaders,
} from './types.js';

const baseUrl = config.GATEWAY_URL.replace(/\/$/, '');
const timeout = config.GATEWAY_TIMEOUT_MS;

export async function getTransaction(txId: string): Promise<GatewayTransaction | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/tx/${txId}`, timeout);
    if (res.status === 404) return null;
    if (!res.ok) {
      logger.warn({ status: res.status, txId }, 'Unexpected response from GET /tx');
      return null;
    }
    return (await res.json()) as GatewayTransaction;
  } catch (error) {
    logger.error({ error, txId }, 'Failed to fetch transaction');
    return null;
  }
}

export async function getTransactionStatus(txId: string): Promise<GatewayTransactionStatus | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/tx/${txId}/status`, timeout);
    if (res.status === 404) return null;
    if (!res.ok) {
      logger.warn({ status: res.status, txId }, 'Unexpected response from GET /tx/status');
      return null;
    }
    return (await res.json()) as GatewayTransactionStatus;
  } catch (error) {
    logger.error({ error, txId }, 'Failed to fetch transaction status');
    return null;
  }
}

export async function getBlock(height: number): Promise<GatewayBlock | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/block/height/${height}`, timeout);
    if (res.status === 404) return null;
    if (!res.ok) {
      logger.warn({ status: res.status, height }, 'Unexpected response from GET /block/height');
      return null;
    }
    return (await res.json()) as GatewayBlock;
  } catch (error) {
    logger.error({ error, height }, 'Failed to fetch block');
    return null;
  }
}

export async function headRawData(txId: string): Promise<RawDataHeaders | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/raw/${txId}`, timeout, { method: 'HEAD' });
    if (res.status === 404) {
      return {
        digest: null,
        rootTransactionId: null,
        contentType: null,
        contentLength: null,
      };
    }
    if (!res.ok) {
      logger.warn({ status: res.status, txId }, 'Unexpected response from HEAD /raw');
      return null;
    }

    const digest = res.headers.get('x-ar-io-digest');
    const rootTxId = res.headers.get('x-ar-io-root-transaction-id');
    const contentType = res.headers.get('content-type');
    const contentLengthStr = res.headers.get('content-length');

    return {
      digest,
      rootTransactionId: rootTxId,
      contentType,
      contentLength: contentLengthStr ? parseInt(contentLengthStr, 10) : null,
    };
  } catch (error) {
    logger.error({ error, txId }, 'Failed to HEAD raw data');
    return null;
  }
}

export async function checkGatewayHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/ar-io/info`, 5000);
    return res.ok;
  } catch {
    return false;
  }
}
