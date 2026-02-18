/**
 * Search service for pHash similarity queries.
 *
 * Provides functionality to search for similar images
 * using perceptual hash (pHash) with Hamming distance.
 */

import { logger } from '../utils/logger.js';
import { searchSimilarByPHash, getManifestByTxId, getManifestCount } from '../db/index.js';
import {
  parsePHash,
  binaryStringToFloatArray,
  floatArrayToBinaryString,
} from '../utils/bit-vector.js';
import { SOFT_BINDING_ALG_ID, softBindingValueToPHashHex } from './softbinding.service.js';

/**
 * Search result item
 */
export interface SearchResultItem {
  /** Manifest transaction ID */
  manifestTxId: string;
  /** C2PA manifest ID (URN) */
  manifestId?: string | null;
  /** Hamming distance (0-64) */
  distance: number;
  /** Content type of original image */
  contentType: string;
  /** Owner address */
  ownerAddress: string;
}

/**
 * Search result
 */
export interface SearchResult {
  /** Query information */
  query: {
    phash: string;
    threshold: number;
    limit: number;
  };
  /** Matching results */
  results: SearchResultItem[];
  /** Total matches found */
  total: number;
}

/**
 * Search options
 */
export interface SearchOptions {
  /** pHash to search for (hex or binary format) */
  phash?: string;
  /** Transaction ID to find similar to */
  txId?: string;
  /** Maximum Hamming distance (default: 10) */
  threshold?: number;
  /** Maximum results to return (default: 10) */
  limit?: number;
}

/**
 * Search for similar images by pHash.
 *
 * @param options - Search options
 * @returns Search results with distance metrics
 */
export async function searchSimilar(options: SearchOptions): Promise<SearchResult> {
  const { phash, txId, threshold = 10, limit = 10 } = options;

  // Validate input
  if (!phash && !txId) {
    throw new Error('Either phash or txId must be provided');
  }

  let queryPhash: string;
  let phashFloats: number[];

  if (phash) {
    // Use provided pHash
    try {
      const binary = parsePHash(phash);
      phashFloats = binaryStringToFloatArray(binary);
      queryPhash = phash;
    } catch (error) {
      throw new Error(`Invalid pHash format: ${phash}`);
    }
  } else if (txId) {
    // Look up pHash from existing manifest
    const manifest = await getManifestByTxId(txId);
    if (!manifest) {
      throw new Error(`Manifest not found: ${txId}`);
    }
    phashFloats = manifest.phash;
    queryPhash = floatArrayToBinaryString(phashFloats);
  } else {
    throw new Error('Either phash or txId must be provided');
  }

  logger.debug(
    {
      queryPhash: queryPhash.slice(0, 16) + '...',
      threshold,
      limit,
    },
    'Searching for similar images'
  );

  // Search the database
  const matches = await searchSimilarByPHash(phashFloats, threshold, limit);

  // Transform results
  const results: SearchResultItem[] = matches.map((m) => ({
    manifestTxId: m.manifestTxId,
    manifestId: m.manifestId ?? null,
    distance: Math.round(m.distance), // Hamming distance is integer
    contentType: m.contentType,
    ownerAddress: m.ownerAddress,
  }));

  logger.info(
    {
      queryPhash: queryPhash.slice(0, 16) + '...',
      threshold,
      found: results.length,
    },
    'Search complete'
  );

  return {
    query: {
      phash: queryPhash,
      threshold,
      limit,
    },
    results,
    total: results.length,
  };
}

export interface SoftBindingQueryResult {
  manifestId: string;
  similarityScore?: number;
  endpoint?: string;
}

export async function searchBySoftBinding(options: {
  alg: string;
  valueB64: string;
  maxResults?: number;
}): Promise<SoftBindingQueryResult[]> {
  const { alg, valueB64, maxResults = 10 } = options;

  if (alg !== SOFT_BINDING_ALG_ID) {
    throw new Error(`Unsupported soft binding algorithm: ${alg}`);
  }

  const pHashHex = softBindingValueToPHashHex(valueB64);
  const binary = parsePHash(pHashHex);
  const phashFloats = binaryStringToFloatArray(binary);

  // Use a reasonable default threshold for perceptual hash
  const threshold = 10;
  const matches = await searchSimilarByPHash(phashFloats, threshold, maxResults);

  return matches
    .filter((m) => !!m.manifestId)
    .map((m) => {
      const distance = Math.round(m.distance);
      const similarity = Math.max(0, 1 - distance / 64);
      return {
        manifestId: m.manifestId as string,
        similarityScore: Math.round(similarity * 100),
      };
    });
}

/**
 * Get database statistics.
 */
export async function getSearchStats(): Promise<{
  totalManifests: number;
  indexStatus: string;
}> {
  const count = await getManifestCount();

  return {
    totalManifests: count,
    indexStatus: 'active',
  };
}
