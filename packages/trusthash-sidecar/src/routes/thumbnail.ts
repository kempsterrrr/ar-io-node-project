/**
 * Thumbnail route handler.
 *
 * GET /v1/thumbnail - Extract and serve thumbnail from C2PA manifest
 */

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { extractThumbnail } from '../services/c2pa.service.js';
import { getManifestByTxId } from '../db/index.js';

const thumbnail = new Hono();

/**
 * GET /v1/thumbnail
 *
 * Extract and serve the thumbnail embedded in a C2PA manifest.
 *
 * Query params:
 * - txId: Manifest transaction ID (required)
 *
 * Response: image/jpeg binary (the embedded thumbnail)
 */
thumbnail.get('/', async (c) => {
  try {
    const txId = c.req.query('txId');

    if (!txId) {
      return c.json(
        {
          success: false,
          error: 'txId query parameter is required',
        },
        400
      );
    }

    // Check if we have this manifest in our database
    const dbRecord = await getManifestByTxId(txId);

    // Fetch the manifest from the gateway
    const gatewayUrl = config.GATEWAY_URL.replace(/\/$/, '');
    const manifestUrl = `${gatewayUrl}/${txId}`;

    logger.debug({ txId, manifestUrl }, 'Fetching manifest for thumbnail extraction');

    const response = await fetch(manifestUrl);

    if (!response.ok) {
      return c.json(
        {
          success: false,
          error: `Manifest not found: ${txId}`,
          indexedLocally: !!dbRecord,
        },
        404
      );
    }

    const manifestBuffer = Buffer.from(await response.arrayBuffer());

    // Extract thumbnail from manifest
    const thumbnailData = await extractThumbnail(manifestBuffer);

    if (!thumbnailData) {
      return c.json(
        {
          success: false,
          error: 'No thumbnail found in manifest',
        },
        404
      );
    }

    // Return the thumbnail as binary
    return new Response(thumbnailData.data, {
      status: 200,
      headers: {
        'Content-Type': thumbnailData.contentType,
        'Content-Length': thumbnailData.data.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Manifest-TxId': txId,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Thumbnail extraction failed');

    return c.json(
      {
        success: false,
        error: `Failed to extract thumbnail: ${(error as Error).message}`,
      },
      500
    );
  }
});

/**
 * GET /v1/thumbnail/info
 *
 * Get thumbnail metadata without downloading the image.
 *
 * Query params:
 * - txId: Manifest transaction ID (required)
 */
thumbnail.get('/info', async (c) => {
  try {
    const txId = c.req.query('txId');

    if (!txId) {
      return c.json(
        {
          success: false,
          error: 'txId query parameter is required',
        },
        400
      );
    }

    // Fetch the manifest from the gateway
    const gatewayUrl = config.GATEWAY_URL.replace(/\/$/, '');
    const manifestUrl = `${gatewayUrl}/${txId}`;

    const response = await fetch(manifestUrl);

    if (!response.ok) {
      return c.json(
        {
          success: false,
          error: `Manifest not found: ${txId}`,
        },
        404
      );
    }

    const manifestBuffer = Buffer.from(await response.arrayBuffer());
    const thumbnailData = await extractThumbnail(manifestBuffer);

    if (!thumbnailData) {
      return c.json(
        {
          success: false,
          error: 'No thumbnail found in manifest',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        manifestTxId: txId,
        contentType: thumbnailData.contentType,
        size: thumbnailData.data.length,
        url: `/v1/thumbnail?txId=${txId}`,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Thumbnail info request failed');

    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      500
    );
  }
});

export default thumbnail;
