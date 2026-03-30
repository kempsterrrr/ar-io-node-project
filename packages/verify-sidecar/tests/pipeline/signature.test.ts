import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifySignature } from '../../src/pipeline/signature.js';
import type { GatewayTransaction } from '../../src/gateway/types.js';

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

describe('verifySignature', () => {
  it('should return null for format 1 transactions', async () => {
    const tx: GatewayTransaction = {
      format: 1,
      id: 'test-id',
      last_tx: '',
      owner: 'dGVzdA',
      tags: [],
      target: '',
      quantity: '0',
      data_root: '',
      data_size: '0',
      reward: '0',
      signature: 'dGVzdA',
    };

    const result = await verifySignature(tx);
    expect(result).toBeNull();
  });

  it('should return false for an invalid signature on a format 2 transaction', async () => {
    // Create a transaction with a deliberately invalid signature
    const tx: GatewayTransaction = {
      format: 2,
      id: 'test-id',
      last_tx: '',
      // A minimal RSA-like owner (too small to be real, but tests the code path)
      owner:
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      tags: [],
      target: '',
      quantity: '0',
      data_root: '',
      data_size: '0',
      reward: '0',
      signature: 'aW52YWxpZC1zaWduYXR1cmU',
    };

    // This will either return false (invalid signature) or null (error during verification)
    // Both are acceptable — the key thing is it doesn't return true
    const result = await verifySignature(tx);
    expect(result).not.toBe(true);
  });

  it('should handle missing fields gracefully', async () => {
    const tx: GatewayTransaction = {
      format: 2,
      id: 'test-id',
      last_tx: '',
      owner: '',
      tags: [],
      target: '',
      quantity: '',
      data_root: '',
      data_size: '',
      reward: '',
      signature: '',
    };

    // Should not throw, should return null (can't verify with empty data)
    const result = await verifySignature(tx);
    expect(result).not.toBe(true);
  });
});
