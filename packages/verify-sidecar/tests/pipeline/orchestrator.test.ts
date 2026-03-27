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

import txResponse from '../fixtures/tx-response.json';
import txStatus from '../fixtures/tx-status.json';
import blockResponse from '../fixtures/block-response.json';

describe('Pipeline: Orchestrator', () => {
  it('produces a full Tier 1 result for indexed transaction', async () => {
    globalThis.fetch = (async (url: string) => {
      const urlStr = typeof url === 'string' ? url : '';
      if (urlStr.includes('/raw/')) {
        return new Response('', {
          status: 200,
          headers: {
            'x-ar-io-digest': 'sha256-b64:FullVerifyHash',
            'content-type': 'text/plain',
            'content-length': '4',
          },
        });
      }
      if (urlStr.includes('/tx/') && urlStr.includes('/status')) {
        return new Response(JSON.stringify(txStatus), { status: 200 });
      }
      if (urlStr.includes('/block/height/')) {
        return new Response(JSON.stringify(blockResponse), { status: 200 });
      }
      return new Response(JSON.stringify(txResponse), { status: 200 });
    }) as typeof fetch;

    const { runVerification } = await import('../../src/pipeline/orchestrator.js');
    const result = await runVerification({ txId: '4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM' });

    expect(result.verificationId).toMatch(/^vrf_/);
    expect(result.tier).toBe('full');
    expect(result.existence.status).toBe('confirmed');
    expect(result.existence.blockHeight).toBe(1438221);
    expect(result.integrity.status).toBe('verified');
    expect(result.integrity.hash).toBe('sha256-b64:FullVerifyHash');
    expect(result.owner.address).toBeTruthy();
    expect(result.links.pdf).toBeTruthy();
  });

  it('produces a Tier 2 result for unindexed transaction', async () => {
    globalThis.fetch = (async (url: string) => {
      const urlStr = typeof url === 'string' ? url : '';
      if (urlStr.includes('/raw/')) {
        return new Response('', { status: 404 });
      }
      if (urlStr.includes('/tx/') && urlStr.includes('/status')) {
        return new Response(JSON.stringify(txStatus), { status: 200 });
      }
      if (urlStr.includes('/block/height/')) {
        return new Response(JSON.stringify(blockResponse), { status: 200 });
      }
      return new Response(JSON.stringify(txResponse), { status: 200 });
    }) as typeof fetch;

    const { runVerification } = await import('../../src/pipeline/orchestrator.js');
    const result = await runVerification({ txId: 'unindexed-tx-id-padded-to-43-characters--' });

    expect(result.tier).toBe('basic');
    expect(result.existence.status).toBe('confirmed');
    expect(result.integrity.status).toBe('unavailable');
    expect(result.integrity.hash).toBeNull();
  });

  it('handles not-found transactions', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;

    const { runVerification } = await import('../../src/pipeline/orchestrator.js');
    const result = await runVerification({ txId: 'nonexistent-tx-padded-to-43-characters---' });

    expect(result.existence.status).toBe('not_found');
    expect(result.tier).toBe('basic');
  });
});
