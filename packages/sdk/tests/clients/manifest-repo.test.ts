import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManifestRepoClient } from '../../src/clients/manifest-repo.js';

describe('ManifestRepoClient', () => {
  const client = new ManifestRepoClient('http://localhost:3000/v1', 5000);
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getManifest', () => {
    it('fetches manifest bytes', async () => {
      const data = new ArrayBuffer(10);
      fetchSpy.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(data),
      });

      const result = await client.getManifest('urn:c2pa:test');
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/v1/manifests/urn%3Ac2pa%3Atest',
        expect.any(Object)
      );
    });
  });

  describe('searchSimilar', () => {
    it('searches by phash with default options', async () => {
      const mockResult = {
        success: true,
        data: {
          results: [
            { manifestTxId: 'tx1', manifestId: 'id1', distance: 3, contentType: 'image/jpeg' },
          ],
          total: 1,
        },
      };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await client.searchSimilar('a5a5a5a5a5a5a5a5');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].manifestTxId).toBe('tx1');
      expect(result.total).toBe(1);
    });

    it('passes threshold and limit as query params', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { results: [], total: 0 } }),
      });

      await client.searchSimilar('a5a5a5a5a5a5a5a5', { threshold: 5, limit: 20 });
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('threshold=5');
      expect(calledUrl).toContain('limit=20');
    });
  });

  describe('matchByBinding', () => {
    it('looks up by algorithm and value', async () => {
      const mockResult = { matches: [{ manifestId: 'id1' }] };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await client.matchByBinding('org.ar-io.phash', 'base64val');
      expect(result.matches).toHaveLength(1);
    });
  });

  describe('health', () => {
    it('returns true when healthy', async () => {
      fetchSpy.mockResolvedValue({ ok: true });
      expect(await client.health()).toBe(true);
    });

    it('returns false on error', async () => {
      fetchSpy.mockRejectedValue(new Error('down'));
      expect(await client.health()).toBe(false);
    });
  });
});
