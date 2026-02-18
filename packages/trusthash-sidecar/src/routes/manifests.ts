/**
 * Manifest repository route handler.
 *
 * GET /v1/manifests/:manifestId - Return manifest store bytes or redirect
 */

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { getManifestById } from '../db/index.js';
import { fetchWithTimeout } from '../utils/http.js';
import {
  GatewayGraphQLError,
  lookupManifestLocatorById,
} from '../services/gateway-graphql.service.js';

const manifests = new Hono();

function parseBooleanQueryParam(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return null;
}

function buildRepoManifestUrl(repoUrl: string, manifestId: string): string {
  const trimmedRepo = repoUrl.replace(/\/$/, '');
  return `${trimmedRepo}/manifests/${encodeURIComponent(manifestId)}`;
}

function redirectResponse(location: string, resolutionPath: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'X-Manifest-Resolution': resolutionPath,
    },
  });
}

manifests.get('/:manifestId', async (c) => {
  try {
    const manifestId = decodeURIComponent(c.req.param('manifestId'));
    if (!manifestId) {
      return c.json(
        {
          success: false,
          error: 'manifestId path parameter is required',
        },
        400
      );
    }

    const returnActiveManifestRaw = c.req.query('returnActiveManifest');
    const returnActiveManifest = parseBooleanQueryParam(returnActiveManifestRaw);
    if (returnActiveManifestRaw !== undefined && returnActiveManifest === null) {
      return c.json(
        {
          success: false,
          error: 'returnActiveManifest must be true or false when provided',
        },
        400
      );
    }

    if (returnActiveManifest === true) {
      return c.json(
        {
          success: false,
          error: 'returnActiveManifest not implemented yet',
        },
        501
      );
    }

    try {
      const locator = await lookupManifestLocatorById(manifestId);
      if (locator?.fetchUrl) {
        logger.info({ manifestId, fetchUrl: locator.fetchUrl }, 'Redirecting to manifest fetch URL');
        return redirectResponse(locator.fetchUrl, 'fetch-url');
      }
      if (locator?.repoUrl) {
        const repoManifestUrl = buildRepoManifestUrl(locator.repoUrl, manifestId);
        logger.info(
          { manifestId, repoUrl: locator.repoUrl, redirectUrl: repoManifestUrl },
          'Redirecting to manifest repository URL'
        );
        return redirectResponse(repoManifestUrl, 'repo-url');
      }
    } catch (error) {
      if (error instanceof GatewayGraphQLError) {
        logger.warn({ error, manifestId }, 'GraphQL locator lookup failed; falling back to local store');
      } else {
        throw error;
      }
    }

    const record = await getManifestById(manifestId);
    if (!record) {
      return c.json(
        {
          success: false,
          error: `Manifest not found: ${manifestId}`,
        },
        404
      );
    }

    const gatewayUrl = config.GATEWAY_URL.replace(/\/$/, '');
    const manifestUrl = `${gatewayUrl}/${record.manifestTxId}`;

    let response: Response;
    try {
      response = await fetchWithTimeout(manifestUrl, config.REFERENCE_FETCH_TIMEOUT_MS, {
        redirect: 'error',
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return c.json(
          {
            success: false,
            error: 'Manifest fetch timed out',
          },
          504
        );
      }
      throw error;
    }
    if (!response.ok) {
      return c.json(
        {
          success: false,
          error: `Manifest not available on gateway: ${record.manifestTxId}`,
        },
        404
      );
    }

    const manifestBuffer = Buffer.from(await response.arrayBuffer());

    return new Response(manifestBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/c2pa',
        'Content-Length': manifestBuffer.length.toString(),
        'X-Manifest-Resolution': 'fallback-manifest-store',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Manifest retrieval failed');
    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      500
    );
  }
});

export default manifests;
