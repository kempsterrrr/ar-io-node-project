import { isIP } from 'node:net';
import dns from 'node:dns/promises';
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

/**
 * Resolve DNS and validate the resolved IP is not private.
 * Returns the resolved IP to pin the connection and prevent DNS rebinding.
 */
async function resolveAndValidateIp(hostname: string): Promise<string | null> {
  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) {
    // Already an IP address — validate directly
    if (ipVersion === 4 && isPrivateIpv4(hostname)) {
      throw new RemoteFetchError(400, 'Private IPv4 reference hosts are not allowed');
    }
    if (ipVersion === 6 && isPrivateIpv6(hostname)) {
      throw new RemoteFetchError(400, 'Private IPv6 reference hosts are not allowed');
    }
    return null; // Already an IP, no DNS pinning needed
  }

  let addresses: string[] = [];
  try {
    addresses = await dns.resolve4(hostname);
  } catch {
    try {
      addresses = await dns.resolve6(hostname);
    } catch {
      // DNS resolution failed — fall through without pinning.
      // The hostname-based validation still blocks local/private hostnames.
      return null;
    }
  }

  if (addresses.length === 0) {
    return null; // No addresses resolved, fall through
  }

  const resolvedIp = addresses[0];
  const resolvedIpVersion = isIP(resolvedIp);
  if (resolvedIpVersion === 4 && isPrivateIpv4(resolvedIp)) {
    throw new RemoteFetchError(400, 'Resolved IP is a private IPv4 address');
  }
  if (resolvedIpVersion === 6 && isPrivateIpv6(resolvedIp)) {
    throw new RemoteFetchError(400, 'Resolved IP is a private IPv6 address');
  }

  return resolvedIp;
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

  // Resolve DNS once and validate the resolved IP to prevent DNS rebinding
  const resolvedIp = await resolveAndValidateIp(url.hostname);

  // Pin the fetch to the resolved IP, preserving the original Host header
  const fetchUrl = new URL(url.toString());
  const fetchHeaders: Record<string, string> = { ...options.headers };
  if (resolvedIp) {
    fetchHeaders['Host'] = url.hostname;
    fetchUrl.hostname = resolvedIp;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      fetchUrl.toString(),
      options.timeoutMs ?? config.REFERENCE_FETCH_TIMEOUT_MS,
      {
        headers: fetchHeaders,
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
