/**
 * Search route handler.
 *
 * GET /v1/search-similar - Search for similar images by pHash
 */

import { Hono } from 'hono';
import { logger } from '../utils/logger.js';
import { searchSimilar, getSearchStats } from '../services/search.service.js';

const search = new Hono();

/**
 * GET /v1/search-similar
 *
 * Search for similar images by pHash using Hamming distance.
 *
 * Query params:
 * - phash: 64-char binary string or 16-char hex (required if no txId)
 * - txId: Manifest transaction ID to find similar to (required if no phash)
 * - threshold: Maximum Hamming distance 0-64 (default: 10)
 * - limit: Maximum results 1-100 (default: 10)
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     query: { phash, threshold, limit },
 *     results: [
 *       { manifestTxId, manifestId, distance, contentType, ownerAddress }
 *     ],
 *     total: 5
 *   }
 * }
 */
search.get('/', async (c) => {
  try {
    const phash = c.req.query('phash');
    const txId = c.req.query('txId');
    const thresholdParam = c.req.query('threshold');
    const limitParam = c.req.query('limit');

    // Validate that either phash or txId is provided
    if (!phash && !txId) {
      return c.json(
        {
          success: false,
          error: 'Either phash or txId query parameter is required',
        },
        400
      );
    }

    // Parse optional parameters
    let threshold = 10;
    if (thresholdParam) {
      threshold = parseInt(thresholdParam, 10);
      if (isNaN(threshold) || threshold < 0 || threshold > 64) {
        return c.json(
          {
            success: false,
            error: 'threshold must be an integer between 0 and 64',
          },
          400
        );
      }
    }

    let limit = 10;
    if (limitParam) {
      limit = parseInt(limitParam, 10);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        return c.json(
          {
            success: false,
            error: 'limit must be an integer between 1 and 100',
          },
          400
        );
      }
    }

    // Perform search
    const result = await searchSimilar({
      phash: phash || undefined,
      txId: txId || undefined,
      threshold,
      limit,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error({ error }, 'Search request failed');

    const statusCode = (error as Error).message.includes('not found') ? 404 : 400;

    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      statusCode
    );
  }
});

/**
 * GET /v1/search-similar/stats
 *
 * Get search index statistics.
 */
search.get('/stats', async (c) => {
  try {
    const stats = await getSearchStats();

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get search stats');

    return c.json(
      {
        success: false,
        error: (error as Error).message,
      },
      500
    );
  }
});

export default search;
