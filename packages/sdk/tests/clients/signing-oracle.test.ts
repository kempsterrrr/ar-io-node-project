import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SigningOracleClient } from '../../src/clients/signing-oracle.js';

describe('SigningOracleClient', () => {
  const client = new SigningOracleClient('http://localhost:3000/v1', 5000);
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    client.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCertificateChain', () => {
    it('fetches and caches certificate PEM', async () => {
      const pem = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
      fetchSpy.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(pem) });

      const result1 = await client.getCertificateChain();
      expect(result1).toBe(pem);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await client.getCertificateChain();
      expect(result2).toBe(pem);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('throws on 501 (signing not enabled)', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 501 });
      await expect(client.getCertificateChain()).rejects.toThrow('signing not enabled');
    });

    it('throws on other HTTP errors', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500 });
      await expect(client.getCertificateChain()).rejects.toThrow('HTTP 500');
    });
  });

  describe('sign', () => {
    it('signs payload and returns signature', async () => {
      const sigBytes = new ArrayBuffer(64);
      fetchSpy.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(sigBytes),
      });

      const payload = new Uint8Array([1, 2, 3]);
      const result = await client.sign(payload);
      expect(result.algorithm).toBe('ES256');
      expect(result.signature).toBeInstanceOf(Uint8Array);
      expect(result.signature.byteLength).toBe(64);
    });

    it('throws on HTTP error', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 400 });
      await expect(client.sign(new Uint8Array([1]))).rejects.toThrow('HTTP 400');
    });
  });

  describe('clearCache', () => {
    it('forces re-fetch after clearing', async () => {
      const pem = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
      fetchSpy.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(pem) });

      await client.getCertificateChain();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      client.clearCache();
      await client.getCertificateChain();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
