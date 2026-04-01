import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArIO } from '../src/ario.js';

describe('ArIO', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs with minimal config (gateway only)', () => {
    const ario = new ArIO({ gatewayUrl: 'http://localhost:3000' });
    expect(ario.gateway).toBeDefined();
    expect(ario.signer).toBeNull();
    expect(ario.manifests).toBeNull();
    expect(ario.verifier).toBeDefined();
  });

  it('constructs with full config', () => {
    const ario = new ArIO({
      gatewayUrl: 'http://localhost:3000',
      trusthashUrl: 'http://localhost:3000/trusthash/v1',
      turboWallet: '0xabc',
    });
    expect(ario.signer).not.toBeNull();
    expect(ario.manifests).not.toBeNull();
  });

  it('info() delegates to gateway client', async () => {
    const ario = new ArIO({ gatewayUrl: 'http://localhost:3000' });
    const mockInfo = { processId: 'abc', release: '1.0.0' };
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockInfo),
    });

    const result = await ario.info();
    expect(result).toEqual(mockInfo);
  });

  it('retrieve() fetches transaction data', async () => {
    const ario = new ArIO({ gatewayUrl: 'http://localhost:3000' });
    const txId = 'short-id';
    fetchSpy.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/plain' },
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('test').buffer),
    });

    const result = await ario.retrieve(txId);
    expect(result.contentType).toBe('text/plain');
    expect(result.data.toString()).toBe('test');
  });

  it('search() throws without trusthashUrl', async () => {
    const ario = new ArIO({ gatewayUrl: 'http://localhost:3000' });
    await expect(ario.search({ phash: 'abc' })).rejects.toThrow('trusthashUrl is required');
  });

  it('search() delegates to manifest repo', async () => {
    const ario = new ArIO({
      gatewayUrl: 'http://localhost:3000',
      trusthashUrl: 'http://localhost:3000/trusthash/v1',
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { results: [], total: 0 },
        }),
    });

    const result = await ario.search({ phash: 'a5a5a5a5a5a5a5a5' });
    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('store() throws without turboWallet', async () => {
    const ario = new ArIO({
      gatewayUrl: 'http://localhost:3000',
    });

    await expect(
      ario.store({ data: Buffer.from('hello'), contentType: 'text/plain' })
    ).rejects.toThrow('turboWallet is required');
  });

  it('query() delegates to gateway GraphQL', async () => {
    const ario = new ArIO({ gatewayUrl: 'http://localhost:3000' });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            transactions: {
              edges: [
                {
                  cursor: 'cursor1',
                  node: {
                    id: 'tx123',
                    owner: { address: 'owner1' },
                    tags: [{ name: 'agent', value: 'bot' }],
                    block: { height: 100, timestamp: 1234567890 },
                    data: { size: '42' },
                  },
                },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        }),
    });

    const result = await ario.query({ tags: [{ name: 'agent', values: ['bot'] }] });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].txId).toBe('tx123');
    expect(result.edges[0].owner).toBe('owner1');
    expect(result.edges[0].dataSize).toBe(42);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it('resolve() delegates to gateway ArNS resolver', async () => {
    const ario = new ArIO({ gatewayUrl: 'http://localhost:3000' });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ txId: 'resolved-tx-id' }),
    });

    const result = await ario.resolve('my-data');
    expect(result.txId).toBe('resolved-tx-id');
  });
});
