import type { DataItemHeader, GatewayTarget, FanOutResult, FanOutOptions } from '../types.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 1_000;

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fanOutToGateway(
  header: DataItemHeader,
  gateway: GatewayTarget,
  timeoutMs: number,
  retries: number,
  retryDelayMs: number
): Promise<FanOutResult> {
  const url = `${gateway.url.replace(/\/$/, '')}/ar-io/admin/queue-data-item`;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gateway.adminApiKey}`,
        },
        body: JSON.stringify([
          {
            ...header,
            tags: header.tags?.map((t) => ({
              name: Buffer.from(t.name, 'utf-8').toString('base64url'),
              value: Buffer.from(t.value, 'utf-8').toString('base64url'),
            })),
          },
        ]),
      });

      if (res.ok) {
        return { gateway: gateway.url, status: 'success' };
      }

      lastError = `HTTP ${res.status}: ${await res.text()}`;
      if (res.status < 500 && res.status !== 408 && res.status !== 429) {
        break;
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
    }
  }

  return { gateway: gateway.url, status: 'error', message: lastError };
}

export async function fanOutDataItem(
  header: DataItemHeader,
  gateways: GatewayTarget[],
  options?: FanOutOptions
): Promise<FanOutResult[]> {
  if (gateways.length === 0) return [];

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  if (
    !Number.isFinite(timeoutMs) ||
    !Number.isFinite(retryDelayMs) ||
    !Number.isInteger(retries) ||
    timeoutMs <= 0 ||
    retries < 0 ||
    retryDelayMs < 0
  ) {
    throw new Error(
      'fanOutDataItem(): timeoutMs must be > 0, retryDelayMs must be >= 0, and retries must be a non-negative integer'
    );
  }

  const results = await Promise.allSettled(
    gateways.map((gw) => fanOutToGateway(header, gw, timeoutMs, retries, retryDelayMs))
  );

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { gateway: gateways[i].url, status: 'error' as const, message: String(r.reason) }
  );
}
