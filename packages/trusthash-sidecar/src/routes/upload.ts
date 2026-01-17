/**
 * Upload route handler.
 *
 * POST /v1/upload - Upload an image and create C2PA manifest
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { uploadImage, getTurboBalance, estimateUploadCost } from '../services/upload.service.js';
import { config } from '../config.js';
import type { StorageMode } from '../types/c2pa.js';

/**
 * Valid storage modes
 */
const VALID_STORAGE_MODES: StorageMode[] = ['standard', 'minimal', 'full'];

const upload = new Hono();

/**
 * Supported image MIME types
 */
const SUPPORTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/avif',
  'image/heif',
];

/**
 * POST /v1/upload
 *
 * Upload an image file and create a C2PA manifest stored on Arweave.
 *
 * Query parameters:
 * - storage: Storage mode - standard (default), minimal, or full
 *   - standard: JUMBF sidecar + thumbnail on Arweave
 *   - minimal: JUMBF sidecar only (privacy/cost mode)
 *   - full: JUMBF sidecar + full signed image + thumbnail (archival)
 *
 * Request: multipart/form-data
 * - file: Image file (required)
 * - title: Optional title/description
 * - creator: Optional creator name
 *
 * Response: JSON with manifest details including base64-encoded signed image
 */
upload.post('/', async (c) => {
  try {
    // Parse storage mode from query parameter
    const storageParam = c.req.query('storage') || 'standard';
    if (!VALID_STORAGE_MODES.includes(storageParam as StorageMode)) {
      return c.json(
        {
          success: false,
          error: `Invalid storage mode: ${storageParam}. Valid modes: ${VALID_STORAGE_MODES.join(', ')}`,
        },
        400
      );
    }
    const storageMode = storageParam as StorageMode;

    const body = await c.req.parseBody();

    // Get the uploaded file
    const file = body['file'];
    if (!file || !(file instanceof File)) {
      return c.json(
        {
          success: false,
          error: 'No file provided. Use multipart/form-data with "file" field.',
        },
        400
      );
    }

    // Validate content type
    const contentType = file.type || 'application/octet-stream';
    if (!SUPPORTED_TYPES.includes(contentType)) {
      return c.json(
        {
          success: false,
          error: `Unsupported file type: ${contentType}. Supported: ${SUPPORTED_TYPES.join(', ')}`,
        },
        400
      );
    }

    // Validate file size
    const maxSize = config.MAX_IMAGE_SIZE_MB * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json(
        {
          success: false,
          error: `File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum: ${config.MAX_IMAGE_SIZE_MB}MB`,
        },
        400
      );
    }

    // Get optional metadata
    const title = typeof body['title'] === 'string' ? body['title'] : undefined;
    const creator = typeof body['creator'] === 'string' ? body['creator'] : undefined;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    logger.info(
      {
        filename: file.name,
        contentType,
        size: file.size,
        hasTitle: !!title,
        hasCreator: !!creator,
        storageMode,
      },
      'Processing upload request'
    );

    // Process the upload
    const result = await uploadImage({
      imageBuffer,
      contentType,
      title,
      creator,
      storageMode,
    });

    if (result.success && result.data) {
      return c.json(
        {
          success: true,
          data: result.data,
        },
        201
      );
    } else {
      return c.json(
        {
          success: false,
          error: result.error || 'Upload failed',
        },
        500
      );
    }
  } catch (error) {
    logger.error({ error }, 'Upload request failed');
    return c.json(
      {
        success: false,
        error: `Upload failed: ${(error as Error).message}`,
      },
      500
    );
  }
});

/**
 * GET /v1/upload/balance
 *
 * Get the Turbo credit balance for the configured wallet.
 */
upload.get('/balance', async (c) => {
  try {
    const balance = await getTurboBalance();
    return c.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get balance');
    return c.json(
      {
        success: false,
        error: `Failed to get balance: ${(error as Error).message}`,
      },
      500
    );
  }
});

/**
 * GET /v1/upload/estimate
 *
 * Estimate upload cost for a given file size.
 *
 * Query params:
 * - bytes: File size in bytes
 */
upload.get('/estimate', async (c) => {
  try {
    const bytesParam = c.req.query('bytes');
    if (!bytesParam) {
      return c.json(
        {
          success: false,
          error: 'Missing required query parameter: bytes',
        },
        400
      );
    }

    const bytes = parseInt(bytesParam, 10);
    if (isNaN(bytes) || bytes <= 0) {
      return c.json(
        {
          success: false,
          error: 'Invalid bytes parameter: must be a positive integer',
        },
        400
      );
    }

    const estimate = await estimateUploadCost(bytes);
    return c.json({
      success: true,
      data: {
        bytes,
        ...estimate,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to estimate cost');
    return c.json(
      {
        success: false,
        error: `Failed to estimate cost: ${(error as Error).message}`,
      },
      500
    );
  }
});

export default upload;
