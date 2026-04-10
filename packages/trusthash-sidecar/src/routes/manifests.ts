/**
 * Manifest repository route handler.
 *
 * GET /v1/manifests/:manifestId - Return manifest store bytes or redirect
 */

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { getManifestArtifactById } from '../db/index.js';
import { fetchWithTimeout } from '../utils/http.js';
import { readStreamWithLimit, SizeLimitError } from '../utils/stream.js';
import {
  GatewayGraphQLError,
  lookupManifestLocatorById,
} from '../services/gateway-graphql.service.js';
import {
  fetchRemoteManifestWithCache,
  RemoteManifestResolutionError,
} from '../services/remote-manifest.service.js';

const manifests = new Hono();

type ManifestResolutionPath =
  | 'fetch-url'
  | 'repo-url'
  | 'fallback-manifest-store'
  | 'proof-remote-fetch'
  | 'proof-remote-cache';

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

function redirectResponse(location: string, resolutionPath: ManifestResolutionPath): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'X-Manifest-Resolution': resolutionPath,
    },
  });
}

function binaryResponse(manifestBuffer: Buffer, resolutionPath: ManifestResolutionPath): Response {
  return new Response(manifestBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/c2pa',
      'Content-Length': manifestBuffer.length.toString(),
      'X-Manifest-Resolution': resolutionPath,
    },
  });
}

async function fetchManifestByTxId(manifestTxId: string): Promise<Buffer> {
  const gatewayUrl = config.GATEWAY_URL.replace(/\/$/, '');
  const manifestUrl = `${gatewayUrl}/${manifestTxId}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(manifestUrl, config.REFERENCE_FETCH_TIMEOUT_MS, {
      redirect: 'error',
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Manifest fetch timed out');
    }
    throw new Error(`Manifest fetch failed: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`Manifest not available on gateway: ${manifestTxId}`);
  }

  try {
    return await readStreamWithLimit(response.body, config.REMOTE_MANIFEST_MAX_BYTES);
  } catch (error) {
    if (error instanceof SizeLimitError) {
      throw new Error('Manifest exceeds configured size limit');
    }
    throw error;
  }
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
          error:
            'returnActiveManifest is not supported. Active manifest extraction requires JUMBF parsing which is not implemented.',
        },
        501
      );
    }

    let locator: {
      manifestId: string;
      manifestTxId: string;
      repoUrl?: string;
      fetchUrl?: string;
      artifactKind?: 'manifest-store' | 'proof-locator';
      remoteManifestUrl?: string;
      manifestDigestAlg?: string;
      manifestDigestB64?: string;
    } | null = null;

    try {
      locator = await lookupManifestLocatorById(manifestId);
      // For proof-locator artifacts, skip redirect — use fetch-through with digest verification
      if (locator?.fetchUrl && locator?.artifactKind !== 'proof-locator') {
        logger.info(
          { manifestId, fetchUrl: locator.fetchUrl, resolution_path: 'fetch-url' },
          'Redirecting to manifest fetch URL'
        );
        return redirectResponse(locator.fetchUrl, 'fetch-url');
      }
      if (locator?.repoUrl && locator?.artifactKind !== 'proof-locator') {
        const repoManifestUrl = buildRepoManifestUrl(locator.repoUrl, manifestId);
        logger.info(
          {
            manifestId,
            repoUrl: locator.repoUrl,
            redirectUrl: repoManifestUrl,
            resolution_path: 'repo-url',
          },
          'Redirecting to manifest repository URL'
        );
        return redirectResponse(repoManifestUrl, 'repo-url');
      }
    } catch (error) {
      if (error instanceof GatewayGraphQLError) {
        logger.warn(
          { error, manifestId },
          'GraphQL locator lookup failed; falling back to local store'
        );
      } else {
        throw error;
      }
    }

    let localRecord: {
      manifestTxId: string;
      artifactKind?: 'manifest-store' | 'proof-locator';
      repoUrl?: string | null;
      fetchUrl?: string | null;
      remoteManifestUrl?: string | null;
      manifestDigestAlg?: string | null;
      manifestDigestB64?: string | null;
    } | null = null;
    try {
      localRecord = await getManifestArtifactById(manifestId);
    } catch (error) {
      logger.warn(
        { error, manifestId },
        'Local manifest lookup unavailable; continuing with locator data'
      );
    }

    if (localRecord?.fetchUrl && localRecord?.artifactKind !== 'proof-locator') {
      logger.info(
        { manifestId, fetchUrl: localRecord.fetchUrl, resolution_path: 'fetch-url' },
        'Redirecting to local manifest fetch URL'
      );
      return redirectResponse(localRecord.fetchUrl, 'fetch-url');
    }
    if (localRecord?.repoUrl && localRecord?.artifactKind !== 'proof-locator') {
      const repoManifestUrl = buildRepoManifestUrl(localRecord.repoUrl, manifestId);
      logger.info(
        {
          manifestId,
          repoUrl: localRecord.repoUrl,
          redirectUrl: repoManifestUrl,
          resolution_path: 'repo-url',
        },
        'Redirecting to local manifest repository URL'
      );
      return redirectResponse(repoManifestUrl, 'repo-url');
    }

    const artifactKind =
      localRecord?.artifactKind || locator?.artifactKind || ('manifest-store' as const);
    const resolutionManifestTxId = localRecord?.manifestTxId || locator?.manifestTxId;

    if (artifactKind === 'proof-locator') {
      const remoteManifestUrl = localRecord?.remoteManifestUrl || locator?.remoteManifestUrl;
      const manifestDigestAlg = localRecord?.manifestDigestAlg || locator?.manifestDigestAlg;
      const manifestDigestB64 = localRecord?.manifestDigestB64 || locator?.manifestDigestB64;

      if (!remoteManifestUrl || !manifestDigestAlg || !manifestDigestB64) {
        return c.json(
          {
            success: false,
            error: `Proof-locator metadata incomplete for manifest: ${manifestId}`,
          },
          404
        );
      }

      try {
        const remoteResult = await fetchRemoteManifestWithCache({
          manifestId,
          remoteManifestUrl,
          manifestDigestAlg,
          manifestDigestB64,
        });

        logger.info(
          {
            manifestId,
            artifact_kind: artifactKind,
            resolution_path: remoteResult.resolutionPath,
            cache_hit: remoteResult.cacheHit,
            digest_verified: true,
            remote_fetch_status: 'ok',
          },
          'Resolved manifest bytes from proof-locator metadata'
        );

        return binaryResponse(remoteResult.buffer, remoteResult.resolutionPath);
      } catch (error) {
        if (error instanceof RemoteManifestResolutionError) {
          const statusCode = error.statusCode === 504 ? 504 : 502;
          return c.json(
            {
              success: false,
              error: error.message,
            },
            statusCode
          );
        }
        throw error;
      }
    }

    if (!resolutionManifestTxId) {
      return c.json(
        {
          success: false,
          error: `Manifest not found: ${manifestId}`,
        },
        404
      );
    }

    let manifestBuffer: Buffer;
    try {
      manifestBuffer = await fetchManifestByTxId(resolutionManifestTxId);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('timed out')) {
        return c.json(
          {
            success: false,
            error: 'Manifest fetch timed out',
          },
          504
        );
      }

      if (message.includes('not available')) {
        return c.json(
          {
            success: false,
            error: message,
          },
          404
        );
      }

      return c.json(
        {
          success: false,
          error: message,
        },
        502
      );
    }

    logger.info(
      {
        manifestId,
        artifact_kind: artifactKind,
        resolution_path: 'fallback-manifest-store',
        cache_hit: false,
      },
      'Resolved manifest bytes from local manifest-store fallback'
    );

    return binaryResponse(manifestBuffer, 'fallback-manifest-store');
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
