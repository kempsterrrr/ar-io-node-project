/**
 * Manifest repository route handler.
 *
 * GET /v1/manifests/:manifestId - Return manifest store bytes
 */

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { getManifestById } from '../db/index.js';

const manifests = new Hono();

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

    const response = await fetch(manifestUrl);
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
