import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgenticWay } from '../src/agenticway.js';

describe('AgenticWay', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs with minimal config (gateway only)', () => {
    const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });
    expect(client.gateway).toBeDefined();
    expect(client.signer).toBeNull();
    expect(client.manifests).toBeNull();
    expect(client.verifier).toBeDefined();
  });

  it('constructs with full config', () => {
    const client = new AgenticWay({
      gatewayUrl: 'http://localhost:3000',
      trusthashUrl: 'http://localhost:3000/trusthash/v1',
      turboWallet: '0xabc',
    });
    expect(client.signer).not.toBeNull();
    expect(client.manifests).not.toBeNull();
  });

  it('info() delegates to gateway client', async () => {
    const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });
    const mockInfo = { processId: 'abc', release: '1.0.0' };
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockInfo),
    });

    const result = await client.info();
    expect(result).toEqual(mockInfo);
  });

  it('retrieve() fetches transaction data', async () => {
    const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });
    const txId = 'short-id';
    fetchSpy.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/plain' },
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('test').buffer),
    });

    const result = await client.retrieve(txId);
    expect(result.contentType).toBe('text/plain');
    expect(result.data.toString()).toBe('test');
  });

  it('search() throws without trusthashUrl', async () => {
    const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });
    await expect(client.search({ phash: 'abc' })).rejects.toThrow('trusthashUrl is required');
  });

  it('search() delegates to manifest repo', async () => {
    const client = new AgenticWay({
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

    const result = await client.search({ phash: 'a5a5a5a5a5a5a5a5' });
    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('store() throws without turboWallet', async () => {
    const client = new AgenticWay({
      gatewayUrl: 'http://localhost:3000',
    });

    await expect(
      client.store({ data: Buffer.from('hello'), contentType: 'text/plain' })
    ).rejects.toThrow('turboWallet is required');
  });

  it('query() delegates to gateway GraphQL', async () => {
    const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });

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

    const result = await client.query({ tags: [{ name: 'agent', values: ['bot'] }] });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].txId).toBe('tx123');
    expect(result.edges[0].owner).toBe('owner1');
    expect(result.edges[0].dataSize).toBe(42);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it('resolve() delegates to gateway ArNS resolver', async () => {
    const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ txId: 'resolved-tx-id' }),
    });

    const result = await client.resolve('my-data');
    expect(result.txId).toBe('resolved-tx-id');
  });
});
