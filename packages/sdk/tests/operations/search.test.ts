import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeSearch } from '../../src/operations/search.js';
import { ManifestRepoClient } from '../../src/clients/manifest-repo.js';

describe('executeSearch', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const manifests = new ManifestRepoClient('http://localhost:3000/v1', 5000);

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searches by phash', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            results: [
              { manifestTxId: 'tx1', manifestId: 'id1', distance: 3, contentType: 'image/jpeg' },
            ],
            total: 1,
          },
        }),
    });

    const result = await executeSearch(manifests, { phash: 'a5a5a5a5a5a5a5a5' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].manifestTxId).toBe('tx1');
    expect(result.results[0].distance).toBe(3);
    expect(result.total).toBe(1);
  });

  it('searches by image using byContent endpoint', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          matches: [{ manifestId: 'id1', similarityScore: 5 }],
        }),
    });

    const result = await executeSearch(manifests, {
      image: Buffer.from([1, 2, 3]),
      limit: 5,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].manifestId).toBe('id1');
  });

  it('uses custom threshold and limit', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { results: [], total: 0 } }),
    });

    await executeSearch(manifests, { phash: 'a5a5a5a5a5a5a5a5', threshold: 5, limit: 20 });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('threshold=5');
    expect(url).toContain('limit=20');
  });

  it('throws when neither image nor phash provided', async () => {
    await expect(executeSearch(manifests, {})).rejects.toThrow('either image or phash is required');
  });
});
