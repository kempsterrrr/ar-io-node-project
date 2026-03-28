import { describe, it, expect, afterAll, vi } from 'vitest';

// Mock config before importing client
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

// Mock logger
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

describe('Gateway Client', () => {
  const originalFetch = globalThis.fetch;

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('getTransaction returns parsed transaction', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(txResponse), { status: 200 })) as typeof fetch;

    const { getTransaction } = await import('../../src/gateway/client.js');
    const tx = await getTransaction('4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM');
    expect(tx).not.toBeNull();
    expect(tx!.id).toBe('4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM');
    expect(tx!.owner).toBe('pEbU_SLfRzEsAW25Pf2sNbSl2KsNMCJ1Ark3sHHKGII');
  });

  it('getTransaction returns null on 404', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;

    const { getTransaction } = await import('../../src/gateway/client.js');
    const tx = await getTransaction('nonexistent');
    expect(tx).toBeNull();
  });

  it('getTransactionStatus returns parsed status', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(txStatus), { status: 200 })) as typeof fetch;

    const { getTransactionStatus } = await import('../../src/gateway/client.js');
    const status = await getTransactionStatus('test-tx');
    expect(status).not.toBeNull();
    expect(status!.block_height).toBe(1438221);
    expect(status!.number_of_confirmations).toBe(50000);
  });

  it('getBlock returns parsed block', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(blockResponse), { status: 200 })) as typeof fetch;

    const { getBlock } = await import('../../src/gateway/client.js');
    const block = await getBlock(1438221);
    expect(block).not.toBeNull();
    expect(block!.height).toBe(1438221);
    expect(block!.timestamp).toBe(1710423432);
  });

  it('headRawData returns parsed headers with digest (Tier 1)', async () => {
    globalThis.fetch = (async () =>
      new Response('', {
        status: 200,
        headers: {
          'x-ar-io-digest': 'sha256-b64:Ab3f7xyz',
          'x-ar-io-root-transaction-id': 'root-tx-123',
          'content-type': 'application/pdf',
          'content-length': '245678',
        },
      })) as typeof fetch;

    const { headRawData } = await import('../../src/gateway/client.js');
    const headers = await headRawData('test-tx');
    expect(headers).not.toBeNull();
    expect(headers!.digest).toBe('sha256-b64:Ab3f7xyz');
    expect(headers!.rootTransactionId).toBe('root-tx-123');
    expect(headers!.contentType).toBe('application/pdf');
    expect(headers!.contentLength).toBe(245678);
  });

  it('headRawData returns null digest on 404 (Tier 2)', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;

    const { headRawData } = await import('../../src/gateway/client.js');
    const headers = await headRawData('unindexed-tx');
    expect(headers).not.toBeNull();
    expect(headers!.digest).toBeNull();
    expect(headers!.rootTransactionId).toBeNull();
  });

  it('checkGatewayHealth returns true on 200', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })) as typeof fetch;

    const { checkGatewayHealth } = await import('../../src/gateway/client.js');
    const healthy = await checkGatewayHealth();
    expect(healthy).toBe(true);
  });

  it('checkGatewayHealth returns false on error', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connection refused');
    }) as typeof fetch;

    const { checkGatewayHealth } = await import('../../src/gateway/client.js');
    const healthy = await checkGatewayHealth();
    expect(healthy).toBe(false);
  });
});
