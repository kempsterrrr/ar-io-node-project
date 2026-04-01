import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeQuery } from '../../src/operations/query.js';
import { GatewayClient } from '../../src/clients/gateway.js';

describe('executeQuery', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let gateway: GatewayClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    gateway = new GatewayClient('http://localhost:3000', 15000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries by tags', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            transactions: {
              edges: [
                {
                  cursor: 'c1',
                  node: {
                    id: 'tx1',
                    owner: { address: 'addr1' },
                    tags: [{ name: 'agent', value: 'research-bot' }],
                    block: { height: 500, timestamp: 1700000000 },
                    data: { size: '1024' },
                  },
                },
              ],
              pageInfo: { hasNextPage: true },
            },
          },
        }),
    });

    const result = await executeQuery(gateway, {
      tags: [{ name: 'agent', values: ['research-bot'] }],
      first: 10,
    });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].txId).toBe('tx1');
    expect(result.edges[0].tags[0].value).toBe('research-bot');
    expect(result.edges[0].dataSize).toBe(1024);
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.endCursor).toBe('c1');
  });

  it('returns empty results for no matches', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            transactions: {
              edges: [],
              pageInfo: { hasNextPage: false },
            },
          },
        }),
    });

    const result = await executeQuery(gateway, {
      tags: [{ name: 'nonexistent', values: ['nothing'] }],
    });

    expect(result.edges).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(result.pageInfo.endCursor).toBeNull();
  });

  it('supports pagination via after cursor', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            transactions: {
              edges: [
                {
                  cursor: 'c2',
                  node: {
                    id: 'tx2',
                    owner: { address: 'addr2' },
                    tags: [],
                    block: { height: 501, timestamp: 1700000100 },
                    data: { size: '512' },
                  },
                },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        }),
    });

    const result = await executeQuery(gateway, {
      after: 'c1',
      first: 5,
    });

    // Verify the query included the after parameter
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(callBody.query).toContain('after: "c1"');

    expect(result.edges[0].txId).toBe('tx2');
  });

  it('filters by owners', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            transactions: {
              edges: [],
              pageInfo: { hasNextPage: false },
            },
          },
        }),
    });

    await executeQuery(gateway, {
      owners: ['wallet-addr-1', 'wallet-addr-2'],
    });

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(callBody.query).toContain('owners: ["wallet-addr-1","wallet-addr-2"]');
  });
});
