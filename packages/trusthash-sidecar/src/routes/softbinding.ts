/**
 * Soft binding resolution API routes.
 *
 * Implements C2PA soft binding resolution endpoints:
 * - /matches/byBinding
 * - /matches/byContent
 * - /matches/byReference
 */

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import {
  GatewayGraphQLError,
  lookupBySoftBinding,
  type SoftBindingManifestResult,
} from '../services/gateway-graphql.service.js';
import { searchBySoftBinding } from '../services/search.service.js';
import { computePHash } from '../services/phash.service.js';
import { validateImage } from '../services/image.service.js';
import { SizeLimitError, readStreamWithLimit } from '../utils/stream.js';
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

function normalizeBindingResponse(results: SoftBindingManifestResult[]) {
  return {
    manifestResults: results,
    matches: results,
  };
}

function statusForBindingError(error: unknown): number {
  if (error instanceof GatewayGraphQLError) {
    return 502;
  }
  return 400;
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

    const matches = await lookupBySoftBinding({ alg, valueB64: value, maxResults });

    return c.json(normalizeBindingResponse(matches));
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

    const matches = await lookupBySoftBinding({
      alg: body.alg,
      valueB64: body.value,
      maxResults,
    });

    return c.json(normalizeBindingResponse(matches));
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
    const alg = c.req.query('alg') || SOFT_BINDING_ALG_ID;
    const maxResults = parseMaxResults(c.req.query('maxResults'));
    const { hintAlg, hintValue } = parseHintParams({
      hintAlg: c.req.query('hintAlg') || undefined,
      hintValue: c.req.query('hintValue') || undefined,
    });

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
    const valueB64 = hintValue || pHashHexToSoftBindingValue(phash.hex);
    const searchAlg = hintAlg || alg;

    const matches = await searchBySoftBinding({ alg: searchAlg, valueB64, maxResults });

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
  return c.json(
    {
      success: false,
      error: 'byReference not implemented yet',
    },
    501
  );
});

export default softbinding;
