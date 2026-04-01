import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VerifyClient } from '../../src/clients/verify.js';

describe('VerifyClient', () => {
  const client = new VerifyClient('http://localhost:4001', 5000);
  let fetchSpy: ReturnType<typeof vi.fn>;

  const mockVerifyResponse = {
    verificationId: 'vrf_123',
    timestamp: '2026-01-01T00:00:00Z',
    txId: 'test-tx-id',
    tier: 'full',
    existence: {
      status: 'confirmed',
      blockHeight: 100,
      blockTimestamp: '2026-01-01T00:00:00Z',
      blockId: 'block-1',
      confirmations: 50,
    },
    owner: {
      address: '0xabc',
      publicKey: 'pk123',
      signatureValid: true,
    },
    integrity: {
      status: 'verified',
      hash: 'hash123',
      onChainDigest: 'digest123',
      match: true,
      deepVerification: false,
    },
    metadata: {
      dataSize: 1024,
      contentType: 'image/jpeg',
      tags: [{ name: 'Content-Type', value: 'image/jpeg' }],
    },
    links: {
      dashboard: '/verify/vrf_123',
      pdf: '/verify/vrf_123/pdf',
      rawData: null,
    },
  };

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('verify', () => {
    it('verifies a transaction and maps response', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockVerifyResponse),
      });

      const result = await client.verify('test-tx-id');
      expect(result.verificationId).toBe('vrf_123');
      expect(result.valid).toBe(true);
      expect(result.tier).toBe('full');
      expect(result.existence.status).toBe('confirmed');
      expect(result.integrity.status).toBe('verified');
      expect(result.metadata.contentType).toBe('image/jpeg');
    });

    it('marks as invalid when existence is not confirmed', async () => {
      const notFound = {
        ...mockVerifyResponse,
        existence: { ...mockVerifyResponse.existence, status: 'not_found' },
      };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(notFound),
      });

      const result = await client.verify('test-tx-id');
      expect(result.valid).toBe(false);
    });

    it('throws on HTTP error', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 400 });
      await expect(client.verify('bad-tx')).rejects.toThrow('HTTP 400');
    });
  });

  describe('getResult', () => {
    it('returns cached result', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockVerifyResponse),
      });

      const result = await client.getResult('vrf_123');
      expect(result?.verificationId).toBe('vrf_123');
    });

    it('returns null on error', async () => {
      fetchSpy.mockRejectedValue(new Error('not found'));
      const result = await client.getResult('vrf_999');
      expect(result).toBeNull();
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
