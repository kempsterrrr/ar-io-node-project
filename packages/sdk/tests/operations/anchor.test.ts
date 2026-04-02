import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sha256Hex } from '../../src/integrity/merkle.js';
import type { ResolvedConfig } from '../../src/config.js';

const mockUploadToArweave = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    txId: 'mock-tx-id',
    viewUrl: 'http://localhost:3000/mock-tx-id',
    owner: 'mock-owner',
    dataCaches: [],
  })
);

vi.mock('../../src/c2pa/upload.js', () => ({
  uploadToArweave: mockUploadToArweave,
}));

import { executeAnchor } from '../../src/operations/anchor.js';

describe('executeAnchor', () => {
  const config: ResolvedConfig = {
    gatewayUrl: 'http://localhost:3000',
    trusthashUrl: null,
    turboWallet: '0xdeadbeef',
    timeoutMs: 15000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadToArweave.mockResolvedValue({
      txId: 'mock-tx-id',
      viewUrl: 'http://localhost:3000/mock-tx-id',
      owner: 'mock-owner',
      dataCaches: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws without turboWallet', async () => {
    const noWalletConfig = { ...config, turboWallet: null };
    await expect(executeAnchor(noWalletConfig, { data: Buffer.from('test') })).rejects.toThrow(
      'turboWallet is required'
    );
  });

  it('anchors data and returns txId, hash, timestamp', async () => {
    const data = Buffer.from('hello world');
    const expectedHash = sha256Hex(data);

    const result = await executeAnchor(config, { data });

    expect(result.txId).toBe('mock-tx-id');
    expect(result.hash).toBe(expectedHash);
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  it('passes correct tags to upload', async () => {
    await executeAnchor(config, {
      data: Buffer.from('test'),
      metadata: { Source: 'unit-test' },
    });

    expect(mockUploadToArweave).toHaveBeenCalledOnce();
    const callArgs = mockUploadToArweave.mock.calls[0][0];
    const tagNames = callArgs.tags.map((t: { name: string }) => t.name);

    expect(tagNames).toContain('Content-Type');
    expect(tagNames).toContain('Data-Protocol');
    expect(tagNames).toContain('Type');
    expect(tagNames).toContain('Hash-Algorithm');
    expect(tagNames).toContain('Data-Hash');
    expect(tagNames).toContain('Source');

    const protocolTag = callArgs.tags.find((t: { name: string }) => t.name === 'Data-Protocol');
    expect(protocolTag.value).toBe('AgenticWay-Integrity');

    const typeTag = callArgs.tags.find((t: { name: string }) => t.name === 'Type');
    expect(typeTag.value).toBe('integrity-anchor');
  });

  it('accepts Uint8Array data', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const result = await executeAnchor(config, { data });
    expect(result.txId).toBe('mock-tx-id');
    expect(result.hash).toBe(sha256Hex(data));
  });
});
