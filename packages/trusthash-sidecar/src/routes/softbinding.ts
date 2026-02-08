/**
 * Soft binding resolution API routes.
 *
 * Implements C2PA soft binding resolution endpoints:
 * - /matches/byBinding
 * - /matches/byContent
 * - /matches/byReference
 */

import { Hono } from 'hono';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent } from 'undici';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { searchBySoftBinding } from '../services/search.service.js';
import { computePHash } from '../services/phash.service.js';
import { validateImage } from '../services/image.service.js';
import { SizeLimitError, readStreamWithLimit } from '../utils/stream.js';
import { fetchWithTimeout } from '../utils/http.js';
import {
  SOFT_BINDING_ALG_ID,
  pHashHexToSoftBindingValue,
} from '../services/softbinding.service.js';

const softbinding = new Hono();

function parseMaxResults(input?: string): number {
  if (!input) {
    return 10;
  }
  const value = parseInt(input, 10);
  if (isNaN(value) || value < 1) {
    return 10;
  }
  return Math.min(value, 100);
}

function parseContentLength(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }
  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a >= 224) return true; // Multicast/reserved

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === '::1' || normalized === '::') {
    return true;
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true; // Unique local
  }
  if (normalized.startsWith('fe80')) {
    return true; // Link-local
  }
  if (normalized.startsWith('2001:db8')) {
    return true; // Documentation range
  }

  const v4Index = normalized.lastIndexOf('::ffff:');
  if (v4Index >= 0) {
    const ipv4 = normalized.slice(v4Index + '::ffff:'.length);
    return isPrivateIPv4(ipv4);
  }

  return false;
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateIPv4(ip);
  }
  if (version === 6) {
    return isPrivateIPv6(ip);
  }
  return true;
}

type ResolvedAddress = {
  address: string;
  family: number;
};

async function resolvePublicHost(
  hostname: string,
  allowPrivate: boolean
): Promise<ResolvedAddress> {
  const lower = hostname.toLowerCase();
  if (!allowPrivate) {
    if (
      lower === 'localhost' ||
      lower.endsWith('.localhost') ||
      lower.endsWith('.local') ||
      lower.endsWith('.internal')
    ) {
      throw new Error('referenceUrl host is not allowed');
    }
  }

  const version = isIP(hostname);
  if (version) {
    if (!allowPrivate && isPrivateIp(hostname)) {
      throw new Error('referenceUrl host resolves to a private address');
    }
    return { address: hostname, family: version };
  }

  let records: Array<{ address: string; family?: number }>;
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new Error('referenceUrl host could not be resolved');
  }

  if (!records.length) {
    throw new Error('referenceUrl host could not be resolved');
  }

  for (const record of records) {
    if (!allowPrivate && isPrivateIp(record.address)) {
      throw new Error('referenceUrl host resolves to a private address');
    }
  }

  const ipv4Record = records.find((record) => (record.family ?? isIP(record.address)) === 4);
  const chosen = ipv4Record || records[0];
  return {
    address: chosen.address,
    family: (chosen.family ?? isIP(chosen.address)) || 4,
  };
}

async function fetchReference(
  url: URL,
  timeoutMs: number,
  allowPrivate: boolean
): Promise<{ response: Response; close: () => Promise<void> }> {
  if (allowPrivate) {
    const response = await fetchWithTimeout(url.toString(), timeoutMs, {
      redirect: 'error',
    });
    return {
      response,
      close: async () => undefined,
    };
  }

  const { address, family } = await resolvePublicHost(url.hostname, false);
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, address, family);
      },
      servername: url.hostname,
    },
  });

  const response = await fetchWithTimeout(url.toString(), timeoutMs, {
    dispatcher,
    redirect: 'error',
  });

  return {
    response,
    close: () => dispatcher.close(),
  };
}

softbinding.get('/byBinding', async (c) => {
  try {
    const alg = c.req.query('alg');
    const value = c.req.query('value');
    const maxResults = parseMaxResults(c.req.query('maxResults'));

    if (!alg || !value) {
      return c.json(
        {
          success: false,
          error: 'alg and value query parameters are required',
        },
        400
      );
    }

    const matches = await searchBySoftBinding({ alg, valueB64: value, maxResults });

    return c.json({
      matches,
    });
  } catch (error) {
    logger.error({ error }, 'Soft binding lookup failed');
    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      400
    );
  }
});

softbinding.post('/byBinding', async (c) => {
  try {
    const body = (await c.req.json()) as { alg?: string; value?: string };
    const maxResults = parseMaxResults(c.req.query('maxResults'));

    if (!body?.alg || !body?.value) {
      return c.json(
        {
          success: false,
          error: 'alg and value are required in the request body',
        },
        400
      );
    }

    const matches = await searchBySoftBinding({
      alg: body.alg,
      valueB64: body.value,
      maxResults,
    });

    return c.json({
      matches,
    });
  } catch (error) {
    logger.error({ error }, 'Soft binding lookup failed');
    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      400
    );
  }
});

softbinding.post('/byContent', async (c) => {
  try {
    const alg = c.req.query('alg') || SOFT_BINDING_ALG_ID;
    const maxResults = parseMaxResults(c.req.query('maxResults'));

    const contentType = c.req.header('content-type') || 'application/octet-stream';

    const maxBytes = config.MAX_IMAGE_SIZE_MB * 1024 * 1024;
    if (!contentType.startsWith('image/')) {
      return c.json(
        {
          success: false,
          error: 'Unsupported content type. Only images are supported.',
        },
        415
      );
    }

    const contentLength = parseContentLength(c.req.header('content-length'));
    if (contentLength !== null && contentLength > maxBytes) {
      return c.json(
        {
          success: false,
          error: `Content size exceeds ${config.MAX_IMAGE_SIZE_MB}MB limit`,
        },
        413
      );
    }

    let buffer: Buffer;
    try {
      buffer = await readStreamWithLimit(c.req.raw.body, maxBytes);
    } catch (error) {
      if (error instanceof SizeLimitError) {
        return c.json(
          {
            success: false,
            error: `Content size exceeds ${config.MAX_IMAGE_SIZE_MB}MB limit`,
          },
          413
        );
      }
      throw error;
    }

    if (buffer.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Request body is empty',
        },
        400
      );
    }

    const validation = await validateImage(buffer);
    if (!validation.valid) {
      return c.json(
        {
          success: false,
          error: `Invalid image: ${validation.errors.join(', ')}`,
        },
        400
      );
    }

    const phash = await computePHash(buffer);
    const valueB64 = pHashHexToSoftBindingValue(phash.hex);

    const matches = await searchBySoftBinding({ alg, valueB64, maxResults });

    return c.json({
      matches,
    });
  } catch (error) {
    logger.error({ error }, 'Soft binding content lookup failed');
    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      400
    );
  }
});

softbinding.post('/byReference', async (c) => {
  try {
    const body = (await c.req.json()) as {
      referenceUrl?: string;
      assetLength?: number;
      assetType?: string;
      region?: unknown;
    };

    if (!body?.referenceUrl || body.assetLength === undefined || !body?.assetType) {
      return c.json(
        {
          success: false,
          error: 'referenceUrl, assetLength, and assetType are required',
        },
        400
      );
    }

    const assetLength = Number(body.assetLength);
    if (!Number.isFinite(assetLength) || assetLength <= 0) {
      return c.json(
        {
          success: false,
          error: 'assetLength must be a positive number',
        },
        400
      );
    }

    let referenceUrl: URL;
    try {
      referenceUrl = new URL(body.referenceUrl);
    } catch {
      return c.json(
        {
          success: false,
          error: 'referenceUrl must be a valid URL',
        },
        400
      );
    }

    const isHttps = referenceUrl.protocol === 'https:';
    const isHttp = referenceUrl.protocol === 'http:';
    if (!isHttps && !(config.ALLOW_INSECURE_REFERENCE_URL && isHttp)) {
      return c.json(
        {
          success: false,
          error: 'referenceUrl must use https',
        },
        400
      );
    }

    const maxBytes = config.MAX_IMAGE_SIZE_MB * 1024 * 1024;
    if (assetLength > maxBytes) {
      return c.json(
        {
          success: false,
          error: `Asset length exceeds ${config.MAX_IMAGE_SIZE_MB}MB limit`,
        },
        413
      );
    }

    if (!body.assetType.startsWith('image/')) {
      return c.json(
        {
          success: false,
          error: 'Unsupported assetType. Only images are supported.',
        },
        415
      );
    }

    let response: Response;
    let closeDispatcher: (() => Promise<void>) | null = null;
    try {
      const fetched = await fetchReference(
        referenceUrl,
        config.REFERENCE_FETCH_TIMEOUT_MS,
        config.ALLOW_INSECURE_REFERENCE_URL
      );
      response = fetched.response;
      closeDispatcher = fetched.close;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return c.json(
          {
            success: false,
            error: 'Reference fetch timed out',
          },
          504
        );
      }
      throw error;
    }

    try {
      if (!response.ok) {
        return c.json(
          {
            success: false,
            error: `Failed to fetch reference asset: ${response.status}`,
          },
          400
        );
      }

      const responseLength = parseContentLength(response.headers.get('content-length'));
      if (responseLength !== null && (responseLength > assetLength || responseLength > maxBytes)) {
        return c.json(
          {
            success: false,
            error: 'Fetched asset size exceeds declared or maximum length',
          },
          413
        );
      }

      const fetchedType = response.headers.get('content-type')?.split(';')[0] || '';
      if (fetchedType && fetchedType !== body.assetType) {
        return c.json(
          {
            success: false,
            error: `Fetched content-type (${fetchedType}) does not match assetType (${body.assetType})`,
          },
          415
        );
      }

      let buffer: Buffer;
      try {
        buffer = await readStreamWithLimit(response.body, Math.min(maxBytes, assetLength));
      } catch (error) {
        if (error instanceof SizeLimitError) {
          return c.json(
            {
              success: false,
              error: 'Fetched asset size exceeds declared or maximum length',
            },
            413
          );
        }
        throw error;
      }

      if (buffer.length === 0) {
        return c.json(
          {
            success: false,
            error: 'Fetched asset was empty',
          },
          400
        );
      }

      if (buffer.length > assetLength || buffer.length > maxBytes) {
        return c.json(
          {
            success: false,
            error: 'Fetched asset size exceeds declared or maximum length',
          },
          413
        );
      }

      const validation = await validateImage(buffer);
      if (!validation.valid) {
        return c.json(
          {
            success: false,
            error: `Invalid image: ${validation.errors.join(', ')}`,
          },
          400
        );
      }

      const phash = await computePHash(buffer);
      const valueB64 = pHashHexToSoftBindingValue(phash.hex);
      const maxResults = parseMaxResults(c.req.query('maxResults'));
      const alg = c.req.query('alg') || SOFT_BINDING_ALG_ID;

      const matches = await searchBySoftBinding({ alg, valueB64, maxResults });

      return c.json({
        matches,
      });
    } finally {
      if (closeDispatcher) {
        await closeDispatcher();
      }
    }
  } catch (error) {
    logger.error({ error }, 'Soft binding reference lookup failed');
    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      400
    );
  }
});

export default softbinding;
