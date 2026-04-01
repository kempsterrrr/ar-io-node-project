import type { SearchOptions, SearchResult } from '../types.js';
import { ManifestRepoClient } from '../clients/manifest-repo.js';

export async function executeSearch(
  manifestRepo: ManifestRepoClient,
  options: SearchOptions
): Promise<SearchResult> {
  const threshold = options.threshold ?? 10;
  const limit = options.limit ?? 10;

  // If a pre-computed phash is provided, use search-similar directly
  if (options.phash) {
    const result = await manifestRepo.searchSimilar(options.phash, { threshold, limit });
    return {
      results: result.results.map((r) => ({
        manifestTxId: r.manifestTxId,
        manifestId: r.manifestId,
        distance: r.distance,
        contentType: r.contentType,
      })),
      total: result.total,
    };
  }

  // If an image is provided, use byContent endpoint (sidecar computes phash)
  if (options.image) {
    const imageBuffer = Buffer.isBuffer(options.image) ? options.image : Buffer.from(options.image);
    const result = await manifestRepo.matchByContent(imageBuffer, { maxResults: limit });
    return {
      results: result.matches.map((m) => ({
        manifestTxId: '',
        manifestId: m.manifestId,
        distance: m.similarityScore ?? 0,
        contentType: '',
      })),
      total: result.matches.length,
    };
  }

  throw new Error('ArIO.search(): either image or phash is required');
}
