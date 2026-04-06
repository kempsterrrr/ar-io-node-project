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

/** Max bytes to download for verification (100 MB) */
const MAX_RAW_DOWNLOAD_BYTES = 100 * 1024 * 1024;

/** Retry config for waiting on gateway indexing — keep total under 60s for proxy timeouts */
const INDEX_RETRY_DELAY_MS = 10_000;
const INDEX_MAX_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getTransaction(txId: string): Promise<GatewayTransaction | null> {
  for (let attempt = 0; attempt <= INDEX_MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/tx/${txId}`, timeout);
      if (res.status === 404) {
        if (attempt < INDEX_MAX_RETRIES) {
          logger.info(
            { txId, attempt: attempt + 1, maxRetries: INDEX_MAX_RETRIES },
            'Transaction not found, waiting for gateway to index...'
          );
          await sleep(INDEX_RETRY_DELAY_MS);
          continue;
        }
        return null;
      }
      if (!res.ok) {
        logger.warn({ status: res.status, txId }, 'Unexpected response from GET /tx');
        if (attempt < INDEX_MAX_RETRIES) {
          await sleep(INDEX_RETRY_DELAY_MS);
          continue;
        }
        return null;
      }
      return (await res.json()) as GatewayTransaction;
    } catch (error) {
      // Timeout or network error — also retry (gateway may be fetching from peers)
      if (attempt < INDEX_MAX_RETRIES) {
        logger.info(
          { txId, attempt: attempt + 1, maxRetries: INDEX_MAX_RETRIES },
          'Gateway request failed, retrying...'
        );
        await sleep(INDEX_RETRY_DELAY_MS);
        continue;
      }
      logger.error({ error, txId }, 'Failed to fetch transaction after retries');
      return null;
    }
  }
  return null;
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

function parseBoolHeader(value: string | null): boolean | null {
  if (value === null) return null;
  return value === 'true';
}

function parseIntHeader(value: string | null): number | null {
  if (value === null) return null;
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

const EMPTY_HEADERS: RawDataHeaders = {
  digest: null,
  rootTransactionId: null,
  contentType: null,
  contentLength: null,
  signature: null,
  owner: null,
  ownerAddress: null,
  signatureType: null,
  anchor: null,
  arIoVerified: null,
  arIoStable: null,
  arIoTrusted: null,
  arIoHops: null,
  arIoDataId: null,
};

export async function headRawData(txId: string): Promise<RawDataHeaders | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/raw/${txId}`, timeout, { method: 'HEAD' });
    if (res.status === 404) {
      return { ...EMPTY_HEADERS };
    }
    if (!res.ok) {
      logger.warn({ status: res.status, txId }, 'Unexpected response from HEAD /raw');
      return null;
    }

    const h = res.headers;
    return {
      digest: h.get('x-ar-io-digest'),
      rootTransactionId: h.get('x-ar-io-root-transaction-id'),
      contentType: h.get('content-type'),
      contentLength: parseIntHeader(h.get('content-length')),

      signature: h.get('x-arweave-signature'),
      owner: h.get('x-arweave-owner'),
      ownerAddress: h.get('x-arweave-owner-address'),
      signatureType: parseIntHeader(h.get('x-arweave-signature-type')),
      anchor: h.get('x-arweave-anchor'),

      arIoVerified: parseBoolHeader(h.get('x-ar-io-verified')),
      arIoStable: parseBoolHeader(h.get('x-ar-io-stable')),
      arIoTrusted: parseBoolHeader(h.get('x-ar-io-trusted')),
      arIoHops: parseIntHeader(h.get('x-ar-io-hops')),
      arIoDataId: h.get('x-ar-io-data-id'),
    };
  } catch (error) {
    logger.error({ error, txId }, 'Failed to HEAD raw data');
    return null;
  }
}

/**
 * Download raw transaction data for independent hash verification.
 * Returns null if the data exceeds MAX_RAW_DOWNLOAD_BYTES or is unavailable.
 */
export async function getRawData(
  txId: string,
  expectedSize: number | null
): Promise<Buffer | null> {
  if (expectedSize !== null && expectedSize > MAX_RAW_DOWNLOAD_BYTES) {
    logger.info(
      { txId, size: expectedSize, limit: MAX_RAW_DOWNLOAD_BYTES },
      'Skipping raw download: exceeds size limit'
    );
    return null;
  }

  try {
    const res = await fetchWithTimeout(`${baseUrl}/raw/${txId}`, timeout);
    if (!res.ok) return null;

    const lengthStr = res.headers.get('content-length');
    if (lengthStr && parseInt(lengthStr, 10) > MAX_RAW_DOWNLOAD_BYTES) {
      logger.info({ txId, size: lengthStr }, 'Skipping raw download: content-length exceeds limit');
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > MAX_RAW_DOWNLOAD_BYTES) {
      return null;
    }
    return Buffer.from(arrayBuf);
  } catch (error) {
    logger.error({ error, txId }, 'Failed to download raw data');
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
