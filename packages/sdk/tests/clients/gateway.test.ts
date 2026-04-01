import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GatewayClient } from '../../src/clients/gateway.js';

describe('GatewayClient', () => {
  const client = new GatewayClient('http://localhost:3000', 5000);
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('info', () => {
    it('fetches gateway info', async () => {
      const mockInfo = { processId: 'abc', release: '1.0.0' };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockInfo),
      });

      const result = await client.info();
      expect(result).toEqual(mockInfo);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/ar-io/info',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('throws on HTTP error', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500 });
      await expect(client.info()).rejects.toThrow('HTTP 500');
    });
  });

  describe('fetchTransaction', () => {
    it('fetches transaction data and content type', async () => {
      const data = new ArrayBuffer(4);
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'image/png']]),
        arrayBuffer: () => Promise.resolve(data),
      });

      // Need to mock headers.get properly
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: { get: (key: string) => (key === 'content-type' ? 'image/png' : null) },
        arrayBuffer: () => Promise.resolve(data),
      });

      const result = await client.fetchTransaction('test-tx-id');
      expect(result.contentType).toBe('image/png');
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it('defaults content type to application/octet-stream', async () => {
      const data = new ArrayBuffer(4);
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: () => Promise.resolve(data),
      });

      const result = await client.fetchTransaction('test-tx-id');
      expect(result.contentType).toBe('application/octet-stream');
    });
  });

  describe('fetchTransactionTags', () => {
    it('fetches tags via GraphQL', async () => {
      const tags = [{ name: 'Content-Type', value: 'image/png' }];
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { transaction: { tags } } }),
      });

      const result = await client.fetchTransactionTags(
        'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
      );
      expect(result).toEqual(tags);
    });

    it('returns empty array when no tags found', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { transaction: null } }),
      });

      const result = await client.fetchTransactionTags(
        'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
      );
      expect(result).toEqual([]);
    });
  });

  describe('healthcheck', () => {
    it('returns true when gateway is healthy', async () => {
      fetchSpy.mockResolvedValue({ ok: true });
      expect(await client.healthcheck()).toBe(true);
    });

    it('returns false when gateway is down', async () => {
      fetchSpy.mockRejectedValue(new Error('connection refused'));
      expect(await client.healthcheck()).toBe(false);
    });
  });
});
