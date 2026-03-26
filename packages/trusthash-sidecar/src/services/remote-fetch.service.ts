import { isIP } from 'node:net';
import { config } from '../config.js';
import { fetchWithTimeout } from '../utils/http.js';
import { readStreamWithLimit, SizeLimitError } from '../utils/stream.js';

export class RemoteFetchError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'RemoteFetchError';
    this.statusCode = statusCode;
  }
}

function isLocalHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local')
  );
}

function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split('.').map((value) => Number(value));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  );
}

function assertRemoteUrlAllowed(url: URL, allowInsecure: boolean): void {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RemoteFetchError(400, 'referenceUrl must use http or https');
  }

  if (!allowInsecure && url.protocol !== 'https:') {
    throw new RemoteFetchError(400, 'Only https reference URLs are allowed');
  }

  if (isLocalHostname(url.hostname)) {
    throw new RemoteFetchError(400, 'Local or private reference hosts are not allowed');
  }

  const ipVersion = isIP(url.hostname);
  if (ipVersion === 4 && isPrivateIpv4(url.hostname)) {
    throw new RemoteFetchError(400, 'Private IPv4 reference hosts are not allowed');
  }
  if (ipVersion === 6 && isPrivateIpv6(url.hostname)) {
    throw new RemoteFetchError(400, 'Private IPv6 reference hosts are not allowed');
  }
}

export function parseAndValidateRemoteUrl(
  rawUrl: string,
  options: { allowInsecure?: boolean } = {}
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new RemoteFetchError(400, 'Invalid referenceUrl');
  }

  assertRemoteUrlAllowed(parsed, options.allowInsecure ?? config.ALLOW_INSECURE_REFERENCE_URL);
  return parsed;
}

export async function fetchRemoteBytes(
  rawUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes: number;
    allowInsecure?: boolean;
    headers?: Record<string, string>;
  }
): Promise<{ buffer: Buffer; contentType: string }> {
  const url = parseAndValidateRemoteUrl(rawUrl, { allowInsecure: options.allowInsecure });

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url.toString(),
      options.timeoutMs ?? config.REFERENCE_FETCH_TIMEOUT_MS,
      {
        headers: options.headers,
        redirect: 'follow',
      }
    );
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new RemoteFetchError(504, 'Remote fetch timed out');
    }
    throw new RemoteFetchError(502, `Remote fetch failed: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new RemoteFetchError(502, `Remote fetch failed with status ${response.status}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed > options.maxBytes) {
      throw new RemoteFetchError(413, 'Remote content exceeds configured size limit');
    }
  }

  let buffer: Buffer;
  try {
    buffer = await readStreamWithLimit(response.body, options.maxBytes);
  } catch (error) {
    if (error instanceof SizeLimitError) {
      throw new RemoteFetchError(413, 'Remote content exceeds configured size limit');
    }
    throw error;
  }

  return {
    buffer,
    contentType:
      response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream',
  };
}
