import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteSigner } from '../src/signer.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('RemoteSigner', () => {
  it('fetches certificate from /cert', async () => {
    const certPem = '-----BEGIN CERTIFICATE-----\nTESTDATA\n-----END CERTIFICATE-----';
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response(certPem, {
        status: 200,
        headers: { 'Content-Type': 'application/x-pem-file' },
      })) as typeof fetch;

    const signer = new RemoteSigner('http://localhost:3003/v1');
    const cert = await signer.getCertificateChain();

    expect(cert).toBe(certPem);
    expect(cert).toContain('BEGIN CERTIFICATE');
  });

  it('caches certificate on subsequent calls', async () => {
    let callCount = 0;
    (globalThis as { fetch: typeof fetch }).fetch = (async () => {
      callCount++;
      return new Response('-----BEGIN CERTIFICATE-----\nCACHED\n-----END CERTIFICATE-----', {
        status: 200,
      });
    }) as typeof fetch;

    const signer = new RemoteSigner('http://localhost:3003/v1');
    await signer.getCertificateChain();
    await signer.getCertificateChain();

    expect(callCount).toBe(1);
  });

  it('clears cache when clearCache is called', async () => {
    let callCount = 0;
    (globalThis as { fetch: typeof fetch }).fetch = (async () => {
      callCount++;
      return new Response('-----BEGIN CERTIFICATE-----\nDATA\n-----END CERTIFICATE-----', {
        status: 200,
      });
    }) as typeof fetch;

    const signer = new RemoteSigner('http://localhost:3003/v1');
    await signer.getCertificateChain();
    signer.clearCache();
    await signer.getCertificateChain();

    expect(callCount).toBe(2);
  });

  it('signs payload via /sign', async () => {
    const fakeSig = new Uint8Array(64).fill(0xab);
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response(fakeSig, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      })) as typeof fetch;

    const signer = new RemoteSigner('http://localhost:3003/v1');
    const result = await signer.sign(new Uint8Array([1, 2, 3]));

    expect(result.signature.length).toBe(64);
    expect(result.algorithm).toBe('ES256');
  });

  it('throws when signing is disabled (501)', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('', { status: 501 })) as typeof fetch;

    const signer = new RemoteSigner('http://localhost:3003/v1');

    await expect(signer.sign(new Uint8Array([1]))).rejects.toThrow('not enabled');
  });

  it('throws when cert fetch fails', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('', { status: 500 })) as typeof fetch;

    const signer = new RemoteSigner('http://localhost:3003/v1');

    await expect(signer.getCertificateChain()).rejects.toThrow('failed');
  });
});
