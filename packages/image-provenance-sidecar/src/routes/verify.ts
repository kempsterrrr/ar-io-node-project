/**
 * Verify route handler.
 *
 * GET /v1/verify-authenticity - Verify C2PA manifest signatures
 */

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { verifyManifest, readManifest } from '../services/c2pa.service.js';
import { getManifestByTxId } from '../db/index.js';

const verify = new Hono();

/**
 * GET /v1/verify-authenticity
 *
 * Verify a C2PA manifest's signatures and integrity.
 *
 * Query params:
 * - txId: Manifest transaction ID (required)
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     manifestTxId: "abc123...",
 *     verified: true,
 *     manifest: {
 *       claimGenerator: "...",
 *       created: "...",
 *       signatureInfo: { ... },
 *       assertions: [ ... ],
 *       ingredients: [ ... ]
 *     },
 *     validationStatus: {
 *       signatureValid: true,
 *       certificateValid: true,
 *       hashMatch: null,
 *       errors: [],
 *       warnings: ["Self-signed certificate"]
 *     }
 *   }
 * }
 */
verify.get('/', async (c) => {
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

    logger.debug({ txId, manifestUrl }, 'Fetching manifest for verification');

    const response = await fetch(manifestUrl);

    if (!response.ok) {
      // If not found on gateway, check if we have DB record
      if (dbRecord) {
        return c.json({
          success: true,
          data: {
            manifestTxId: txId,
            verified: false,
            indexedLocally: true,
            message: 'Manifest indexed locally but not yet available on gateway',
            dbRecord: {
              arnsUrl: dbRecord.arnsFullUrl,
              contentType: dbRecord.contentType,
              ownerAddress: dbRecord.ownerAddress,
            },
            validationStatus: {
              signatureValid: false,
              certificateValid: false,
              hashMatch: null,
              errors: ['Manifest not available on gateway'],
              warnings: [],
            },
          },
        });
      }

      return c.json(
        {
          success: false,
          error: `Manifest not found: ${txId}`,
        },
        404
      );
    }

    const manifestBuffer = Buffer.from(await response.arrayBuffer());

    // Verify the manifest
    const result = await verifyManifest(manifestBuffer);

    return c.json({
      success: true,
      data: {
        manifestTxId: txId,
        verified: result.verified,
        manifest: result.manifest,
        validationStatus: result.validationStatus,
        indexedLocally: !!dbRecord,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Verification request failed');

    return c.json(
      {
        success: false,
        error: `Verification failed: ${(error as Error).message}`,
      },
      500
    );
  }
});

/**
 * GET /v1/verify-authenticity/local
 *
 * Check if a manifest is indexed locally without fetching from gateway.
 *
 * Query params:
 * - txId: Manifest transaction ID (required)
 */
verify.get('/local', async (c) => {
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

    const record = await getManifestByTxId(txId);

    if (!record) {
      return c.json(
        {
          success: false,
          error: `Manifest not found locally: ${txId}`,
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        manifestTxId: record.manifestTxId,
        arnsUrl: record.arnsFullUrl,
        arnsUndername: record.arnsUndername,
        contentType: record.contentType,
        ownerAddress: record.ownerAddress,
        hasPriorManifest: record.hasPriorManifest,
        claimGenerator: record.claimGenerator,
        blockHeight: record.blockHeight,
        indexedLocally: true,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Local verification request failed');

    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      500
    );
  }
});

export default verify;
