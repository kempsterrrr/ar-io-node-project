import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config.js', () => ({
  config: {
    PORT: 4001,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    GATEWAY_URL: 'http://localhost:9999',
    GATEWAY_TIMEOUT_MS: 5000,
    SQLITE_PATH: ':memory:',
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

describe('Pipeline: Integrity', () => {
  it('returns Tier 1 (full) when digest header is present', async () => {
    globalThis.fetch = (async () =>
      new Response('', {
        status: 200,
        headers: {
          'x-ar-io-digest': 'sha256-b64:TestHash123',
          'content-type': 'text/plain',
          'content-length': '4',
        },
      })) as typeof fetch;

    const { checkIntegrity } = await import('../../src/pipeline/integrity.js');
    const result = await checkIntegrity('test-tx');

    expect(result.tier).toBe('full');
    expect(result.integrity.status).toBe('verified');
    expect(result.integrity.hash).toBe('sha256-b64:TestHash123');
    expect(result.integrity.match).toBe(true);
  });

  it('returns Tier 2 (basic) when digest header is absent', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;

    const { checkIntegrity } = await import('../../src/pipeline/integrity.js');
    const result = await checkIntegrity('unindexed-tx');

    expect(result.tier).toBe('basic');
    expect(result.integrity.status).toBe('unavailable');
    expect(result.integrity.hash).toBeNull();
    expect(result.integrity.match).toBeNull();
  });

  it('detects bundled data items', async () => {
    globalThis.fetch = (async () =>
      new Response('', {
        status: 200,
        headers: {
          'x-ar-io-digest': 'sha256-b64:BundleHash',
          'x-ar-io-root-transaction-id': 'root-tx-different',
          'content-type': 'application/octet-stream',
          'content-length': '1000',
        },
      })) as typeof fetch;

    const { checkIntegrity } = await import('../../src/pipeline/integrity.js');
    const result = await checkIntegrity('bundled-data-item');

    expect(result.tier).toBe('full');
    expect(result.bundle.isBundled).toBe(true);
    expect(result.bundle.rootTransactionId).toBe('root-tx-different');
  });

  it('does not mark as bundled when root tx matches request tx', async () => {
    globalThis.fetch = (async () =>
      new Response('', {
        status: 200,
        headers: {
          'x-ar-io-digest': 'sha256-b64:SameHash',
          'x-ar-io-root-transaction-id': 'same-tx',
          'content-type': 'text/plain',
        },
      })) as typeof fetch;

    const { checkIntegrity } = await import('../../src/pipeline/integrity.js');
    const result = await checkIntegrity('same-tx');

    expect(result.bundle.isBundled).toBe(false);
  });
});
