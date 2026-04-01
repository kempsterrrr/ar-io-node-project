import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeRetrieve } from '../../src/operations/retrieve.js';
import { GatewayClient } from '../../src/clients/gateway.js';

describe('executeRetrieve', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const gateway = new GatewayClient('http://localhost:3000', 5000);

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retrieves transaction data and tags', async () => {
    const txId = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    const imageData = new ArrayBuffer(4);

    // First call: fetchTransaction
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: () => Promise.resolve(imageData),
    });

    // Second call: fetchTransactionTags (GraphQL)
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { transaction: { tags: [{ name: 'Content-Type', value: 'image/jpeg' }] } },
        }),
    });

    const result = await executeRetrieve(gateway, txId);
    expect(result.contentType).toBe('image/jpeg');
    expect(Buffer.isBuffer(result.data)).toBe(true);
    expect(result.tags).toHaveLength(1);
  });

  it('returns empty tags when GraphQL fails', async () => {
    const txId = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    const imageData = new ArrayBuffer(4);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/plain' },
      arrayBuffer: () => Promise.resolve(imageData),
    });

    // GraphQL fails
    fetchSpy.mockRejectedValueOnce(new Error('graphql error'));

    const result = await executeRetrieve(gateway, txId);
    expect(result.tags).toEqual([]);
  });

  it('skips tag fetch for ArNS names', async () => {
    const imageData = new ArrayBuffer(4);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/html' },
      arrayBuffer: () => Promise.resolve(imageData),
    });

    const result = await executeRetrieve(gateway, 'my-arns-name');
    expect(result.tags).toEqual([]);
    // Only one fetch call (data), no GraphQL call
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
