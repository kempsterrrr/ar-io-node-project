import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeVerifyAnchor } from '../../src/operations/verify-anchor.js';
import { GatewayClient } from '../../src/clients/gateway.js';
import { sha256Hex } from '../../src/integrity/merkle.js';

describe('executeVerifyAnchor', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const gateway = new GatewayClient('http://localhost:3000', 15000);

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns valid=true when hashes match', async () => {
    const data = Buffer.from('hello world');
    const hash = sha256Hex(data);

    // Single GraphQL call: fetchTransactionInfo returns tags + block
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            transaction: {
              tags: [
                { name: 'Data-Protocol', value: 'AgenticWay-Integrity' },
                { name: 'Type', value: 'integrity-anchor' },
                { name: 'Hash-Algorithm', value: 'SHA-256' },
                { name: 'Data-Hash', value: hash },
              ],
              block: { height: 1234, timestamp: 1700000000 },
            },
          },
        }),
    });

    const result = await executeVerifyAnchor(gateway, {
      data,
      txId: 'anchor-tx-id',
    });

    expect(result.valid).toBe(true);
    expect(result.hash).toBe(hash);
    expect(result.anchoredHash).toBe(hash);
    expect(result.blockHeight).toBe(1234);
    expect(result.timestamp).toBeDefined();
    // Only one fetch call (no separate queryGraphQL)
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('returns valid=false when hashes do not match', async () => {
    const data = Buffer.from('hello world');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            transaction: {
              tags: [
                { name: 'Data-Protocol', value: 'AgenticWay-Integrity' },
                { name: 'Data-Hash', value: 'different-hash' },
              ],
              block: null,
            },
          },
        }),
    });

    const result = await executeVerifyAnchor(gateway, {
      data,
      txId: 'anchor-tx-id',
    });

    expect(result.valid).toBe(false);
    expect(result.anchoredHash).toBe('different-hash');
    expect(result.blockHeight).toBeNull();
    expect(result.timestamp).toBeNull();
  });

  it('returns valid=false when transaction is not an integrity anchor', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            transaction: {
              tags: [{ name: 'Content-Type', value: 'text/plain' }],
              block: { height: 100, timestamp: 1600000000 },
            },
          },
        }),
    });

    const result = await executeVerifyAnchor(gateway, {
      data: Buffer.from('test'),
      txId: 'not-anchor-tx',
    });

    expect(result.valid).toBe(false);
    expect(result.anchoredHash).toBeNull();
  });
});
