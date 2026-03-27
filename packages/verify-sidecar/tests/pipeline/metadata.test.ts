import { describe, it, expect, vi } from 'vitest';

// Mock config
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

import txResponse from '../fixtures/tx-response.json';
import txStatus from '../fixtures/tx-status.json';
import blockResponse from '../fixtures/block-response.json';

describe('Pipeline: Metadata', () => {
  it('returns not_found when transaction does not exist', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;

    const { fetchMetadata } = await import('../../src/pipeline/metadata.js');
    const result = await fetchMetadata('nonexistent');
    expect(result).not.toBeNull();
    expect(result!.existence.status).toBe('not_found');
    expect(result!.owner.address).toBeNull();
  });

  it('returns confirmed with full metadata for existing tx', async () => {
    let callCount = 0;
    globalThis.fetch = (async (url: string) => {
      callCount++;
      if (typeof url === 'string' && url.includes('/tx/') && url.includes('/status')) {
        return new Response(JSON.stringify(txStatus), { status: 200 });
      }
      if (typeof url === 'string' && url.includes('/block/height/')) {
        return new Response(JSON.stringify(blockResponse), { status: 200 });
      }
      return new Response(JSON.stringify(txResponse), { status: 200 });
    }) as typeof fetch;

    const { fetchMetadata } = await import('../../src/pipeline/metadata.js');
    const result = await fetchMetadata('4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM');

    expect(result).not.toBeNull();
    expect(result!.existence.status).toBe('confirmed');
    expect(result!.existence.blockHeight).toBe(1438221);
    expect(result!.existence.blockTimestamp).toBeTruthy();
    expect(result!.owner.address).toBeTruthy();
    expect(result!.owner.publicKey).toBe('pEbU_SLfRzEsAW25Pf2sNbSl2KsNMCJ1Ark3sHHKGII');
    expect(result!.metadata.tags.length).toBeGreaterThan(0);
    expect(callCount).toBe(3); // tx, status, block
  });

  it('returns pending when tx exists but has no confirmations', async () => {
    globalThis.fetch = (async (url: string) => {
      if (typeof url === 'string' && url.includes('/status')) {
        return new Response('', { status: 404 });
      }
      return new Response(JSON.stringify(txResponse), { status: 200 });
    }) as typeof fetch;

    const { fetchMetadata } = await import('../../src/pipeline/metadata.js');
    const result = await fetchMetadata('pending-tx');

    expect(result).not.toBeNull();
    expect(result!.existence.status).toBe('pending');
    expect(result!.owner.address).toBeTruthy();
  });
});
