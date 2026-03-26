/**
 * Soft binding resolution API routes.
 *
 * Implements C2PA SBR API v2.2 endpoints:
 * - /matches/byBinding  (spec-defined)
 * - /matches/byContent  (spec-defined)
 * - /matches/byReference (non-standard extension)
 */

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { GatewayGraphQLError, lookupBySoftBinding } from '../services/gateway-graphql.service.js';
import { searchBySoftBinding } from '../services/search.service.js';
import { lookupSoftBindingsByExactValue } from '../db/index.js';
import { computePHash } from '../services/phash.service.js';
import { computeIsccImageCode } from '../services/iscc.service.js';
import { validateImage } from '../services/image.service.js';
import { SizeLimitError, readStreamWithLimit } from '../utils/stream.js';
import {
  SOFT_BINDING_ALG_PHASH,
  SOFT_BINDING_ALG_ISCC,
  COMPUTABLE_ALGS,
  pHashHexToSoftBindingValue,
} from '../services/softbinding.service.js';
import { fetchRemoteBytes, RemoteFetchError } from '../services/remote-fetch.service.js';

const softbinding = new Hono();

const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/avif',
  'image/heif',
];

function unsupportedMediaTypeError(contentType: string): { success: false; error: string } {
  return {
    success: false,
    error: `Unsupported content type: ${contentType}. Supported types: ${SUPPORTED_IMAGE_TYPES.join(', ')}`,
  };
}

/**
 * Compute a soft binding value from an image buffer using the specified algorithm.
 */
async function computeBindingValue(
  imageBuffer: Buffer,
  alg: string
): Promise<{ alg: string; valueB64: string }> {
  if (alg === SOFT_BINDING_ALG_ISCC) {
    const iscc = await computeIsccImageCode(imageBuffer);
    return { alg: SOFT_BINDING_ALG_ISCC, valueB64: iscc.digestB64 };
  }
  // Default: org.ar-io.phash
  const phash = await computePHash(imageBuffer);
  return { alg: SOFT_BINDING_ALG_PHASH, valueB64: pHashHexToSoftBindingValue(phash.hex) };
}

/**
 * C2PA SBR spec match object (c2pa.softBindingQueryResult.matches[]).
 */
interface SpecMatchResult {
  manifestId: string;
  endpoint?: string;
  similarityScore?: number;
}

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

type HintParams = {
  hintAlg?: string;
  hintValue?: string;
};

function parseHintParams(params: HintParams): HintParams {
  const hintAlg = params.hintAlg?.trim() || undefined;
  const hintValue = params.hintValue?.trim() || undefined;
  if (hintValue && !hintAlg) {
    throw new Error('hintValue requires hintAlg');
  }
  return { hintAlg, hintValue };
}

function statusForBindingError(error: unknown): number {
  if (error instanceof GatewayGraphQLError) {
    return 502;
  }
  return 400;
}

/**
 * Merge GraphQL results and local DB results, deduplicate by manifestId.
 * Returns spec-compliant match objects.
 */
async function resolveByBinding(options: {
  alg: string;
  valueB64: string;
  maxResults: number;
}): Promise<SpecMatchResult[]> {
  const { alg, valueB64, maxResults } = options;
  const seen = new Set<string>();
  const matches: SpecMatchResult[] = [];

  // 1. Query GraphQL (tag-backed lookup)
  try {
    const graphqlResults = await lookupBySoftBinding({ alg, valueB64, maxResults });
    for (const r of graphqlResults) {
      if (!seen.has(r.manifestId)) {
        seen.add(r.manifestId);
        matches.push({
          manifestId: r.manifestId,
          endpoint: r.repoUrl || undefined,
        });
      }
    }
  } catch (error) {
    if (error instanceof GatewayGraphQLError) {
      logger.warn({ error }, 'GraphQL byBinding lookup failed; falling back to local DB');
    } else {
      throw error;
    }
  }

  // 2. Query local soft_bindings table (exact match)
  if (matches.length < maxResults) {
    try {
      const localResults = await lookupSoftBindingsByExactValue(
        alg,
        valueB64,
        maxResults - matches.length
      );
      for (const r of localResults) {
        if (!seen.has(r.manifestId)) {
          seen.add(r.manifestId);
          matches.push({ manifestId: r.manifestId });
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Local soft binding lookup failed');
    }
  }

  return matches.slice(0, maxResults);
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

    const matches = await resolveByBinding({ alg, valueB64: value, maxResults });

    return c.json({ matches });
  } catch (error) {
    logger.error({ error }, 'Soft binding lookup failed');
    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      statusForBindingError(error)
    );
  }
});

softbinding.post('/byBinding', async (c) => {
  try {
    const body = (await c.req.json()) as {
      alg?: string;
      value?: string;
      maxResults?: number;
    };
    const maxResults = parseMaxResults(
      c.req.query('maxResults') || (body.maxResults != null ? String(body.maxResults) : undefined)
    );

    if (!body?.alg || !body?.value) {
      return c.json(
        {
          success: false,
          error: 'alg and value are required in the request body',
        },
        400
      );
    }

    const matches = await resolveByBinding({
      alg: body.alg,
      valueB64: body.value,
      maxResults,
    });

    return c.json({ matches });
  } catch (error) {
    logger.error({ error }, 'Soft binding lookup failed');
    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      statusForBindingError(error)
    );
  }
});

softbinding.post('/byContent', async (c) => {
  try {
    const alg = c.req.query('alg') || SOFT_BINDING_ALG_PHASH;
    const maxResults = parseMaxResults(c.req.query('maxResults'));
    const { hintAlg, hintValue } = parseHintParams({
      hintAlg: c.req.query('hintAlg') || undefined,
      hintValue: c.req.query('hintValue') || undefined,
    });

    const contentType = c.req.header('content-type') || 'application/octet-stream';

    const maxBytes = config.MAX_IMAGE_SIZE_MB * 1024 * 1024;
    if (!contentType.startsWith('image/')) {
      return c.json(unsupportedMediaTypeError(contentType), 415);
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

    // Validate algorithm is computable before doing work
    const effectiveAlg = hintAlg || alg;
    if (!(COMPUTABLE_ALGS as readonly string[]).includes(effectiveAlg) && !hintAlg) {
      return c.json(
        {
          success: false,
          error: `Content-based computation not supported for algorithm: ${effectiveAlg}. Supported: ${COMPUTABLE_ALGS.join(', ')}`,
        },
        400
      );
    }

    let searchAlg: string;
    let valueB64: string;

    if (hintAlg && hintValue) {
      searchAlg = hintAlg;
      valueB64 = hintValue;
    } else {
      const computed = await computeBindingValue(buffer, alg);
      searchAlg = computed.alg;
      valueB64 = computed.valueB64;
    }

    const results = await searchBySoftBinding({ alg: searchAlg, valueB64, maxResults });

    const matches: SpecMatchResult[] = results.map((r) => ({
      manifestId: r.manifestId,
      similarityScore: r.similarityScore,
    }));

    return c.json({ matches });
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
  if (!config.ENABLE_BY_REFERENCE) {
    return c.json(
      {
        success: false,
        error: 'byReference is disabled by configuration',
      },
      501
    );
  }

  try {
    const body = (await c.req.json()) as {
      referenceUrl?: string;
      assetLength?: number;
      assetType?: string;
      hintAlg?: string;
      hintValue?: string;
      alg?: string;
    };

    const referenceUrl = body.referenceUrl?.trim();
    if (!referenceUrl) {
      return c.json(
        {
          success: false,
          error: 'referenceUrl is required',
        },
        400
      );
    }

    const maxResults = parseMaxResults(c.req.query('maxResults'));
    const alg = c.req.query('alg') || body.alg || SOFT_BINDING_ALG_PHASH;
    const { hintAlg, hintValue } = parseHintParams({
      hintAlg: body.hintAlg,
      hintValue: body.hintValue,
    });

    // Reject unsupported algorithms before fetching the remote image
    if (!hintAlg && !(COMPUTABLE_ALGS as readonly string[]).includes(alg)) {
      return c.json(
        {
          success: false,
          error: `Content-based computation not supported for algorithm: ${alg}. Supported: ${COMPUTABLE_ALGS.join(', ')}`,
        },
        400
      );
    }

    const maxBytes = config.MAX_IMAGE_SIZE_MB * 1024 * 1024;
    if (typeof body.assetLength === 'number' && body.assetLength > maxBytes) {
      return c.json(
        {
          success: false,
          error: `Content size exceeds ${config.MAX_IMAGE_SIZE_MB}MB limit`,
        },
        413
      );
    }

    let fetched: { buffer: Buffer; contentType: string };
    try {
      fetched = await fetchRemoteBytes(referenceUrl, {
        maxBytes,
        timeoutMs: config.REFERENCE_FETCH_TIMEOUT_MS,
        allowInsecure: config.ALLOW_INSECURE_REFERENCE_URL,
      });
    } catch (error) {
      if (error instanceof RemoteFetchError) {
        return c.json(
          {
            success: false,
            error: error.message,
          },
          error.statusCode
        );
      }
      throw error;
    }

    const contentType = fetched.contentType;
    if (!contentType.startsWith('image/')) {
      return c.json(unsupportedMediaTypeError(contentType), 415);
    }

    const validation = await validateImage(fetched.buffer);
    if (!validation.valid) {
      return c.json(
        {
          success: false,
          error: `Invalid image: ${validation.errors.join(', ')}`,
        },
        400
      );
    }

    let searchAlg: string;
    let valueB64: string;

    if (hintAlg && hintValue) {
      searchAlg = hintAlg;
      valueB64 = hintValue;
    } else {
      const computed = await computeBindingValue(fetched.buffer, alg);
      searchAlg = computed.alg;
      valueB64 = computed.valueB64;
    }

    const results = await searchBySoftBinding({
      alg: searchAlg,
      valueB64,
      maxResults,
    });

    const matches: SpecMatchResult[] = results.map((r) => ({
      manifestId: r.manifestId,
      similarityScore: r.similarityScore,
    }));

    logger.info(
      {
        referenceUrl,
        assetType: body.assetType || contentType,
        resultCount: matches.length,
      },
      'Resolved byReference request'
    );

    return c.json({ matches });
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
