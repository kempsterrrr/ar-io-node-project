import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyReceipt } from '../../src/pipeline/receipt.js';

vi.mock('../../src/config.js', () => ({
  config: {
    GATEWAY_URL: 'http://localhost:4000',
    GATEWAY_TIMEOUT_MS: 5000,
    PORT: 4001,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SQLITE_PATH: ':memory:',
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(() => {
  // Mock fetch for Turbo status endpoint
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ status: 'FINALIZED' }), { status: 200 })
    ) as unknown as typeof fetch;
});

describe('verifyReceipt', () => {
  it('validates a well-formed receipt', async () => {
    const receipt = {
      id: 'test-tx-id-padded-to-43-characters-abcdef',
      version: '0.1.0',
      public: 'dGVzdC1wdWJsaWMta2V5',
      signature: 'dGVzdC1zaWduYXR1cmU',
      timestamp: 1710423400000,
      owner: 'test-owner-address',
      winc: '1000',
      deadlineHeight: 1438220,
    };

    const result = await verifyReceipt({
      receipt,
      txId: 'test-tx-id-padded-to-43-characters-abcdef',
      onChainOwnerAddress: 'test-owner-address',
      blockTimestamp: '2026-03-14T14:47:12.000Z',
    });

    expect(result.provided).toBe(true);
    expect(result.receiptIdMatchesTxId).toBe(true);
    expect(result.ownerMatchesOnChain).toBe(true);
    expect(result.timestampPredatesBlock).toBe(true);
    expect(result.receiptTimestamp).toBeTruthy();
    expect(result.turboStatus).toBe('FINALIZED');
  });

  it('detects tx ID mismatch', async () => {
    const receipt = {
      id: 'different-tx-id-padded-to-43-chars-abcdef',
      version: '0.1.0',
      public: 'dGVzdA',
      signature: 'dGVzdA',
      timestamp: 1710423400000,
    };

    const result = await verifyReceipt({
      receipt,
      txId: 'actual-tx-id-padded-to-43-characters-abcde',
      onChainOwnerAddress: null,
      blockTimestamp: null,
    });

    expect(result.provided).toBe(true);
    expect(result.receiptIdMatchesTxId).toBe(false);
  });

  it('rejects invalid receipt structure', async () => {
    const result = await verifyReceipt({
      receipt: { invalid: true },
      txId: 'some-tx-id',
      onChainOwnerAddress: null,
      blockTimestamp: null,
    });

    expect(result.provided).toBe(true);
    expect(result.signatureValid).toBeNull();
    expect(result.receiptIdMatchesTxId).toBeNull();
  });

  it('handles Turbo status endpoint failure', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

    const receipt = {
      id: 'test-tx-id-padded-to-43-characters-abcdef',
      version: '0.1.0',
      public: 'dGVzdA',
      signature: 'dGVzdA',
      timestamp: 1710423400000,
    };

    const result = await verifyReceipt({
      receipt,
      txId: 'test-tx-id-padded-to-43-characters-abcdef',
      onChainOwnerAddress: null,
      blockTimestamp: null,
    });

    expect(result.provided).toBe(true);
    expect(result.turboStatus).toBeNull();
  });
});
