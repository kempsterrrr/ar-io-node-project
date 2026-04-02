import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sha256Hex, buildMerkleTree, verifyProof } from '../../src/integrity/merkle.js';
import type { ResolvedConfig } from '../../src/config.js';

const mockUploadToArweave = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    txId: 'batch-tx-id',
    viewUrl: 'http://localhost:3000/batch-tx-id',
    owner: 'mock-owner',
    dataCaches: [],
  })
);

vi.mock('../../src/c2pa/upload.js', () => ({
  uploadToArweave: mockUploadToArweave,
}));

import { executeBatchAnchor } from '../../src/operations/batch-anchor.js';

describe('executeBatchAnchor', () => {
  const config: ResolvedConfig = {
    gatewayUrl: 'http://localhost:3000',
    trusthashUrl: null,
    turboWallet: '0xdeadbeef',
    timeoutMs: 15000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadToArweave.mockResolvedValue({
      txId: 'batch-tx-id',
      viewUrl: 'http://localhost:3000/batch-tx-id',
      owner: 'mock-owner',
      dataCaches: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws without turboWallet', async () => {
    const noWalletConfig = { ...config, turboWallet: null };
    await expect(
      executeBatchAnchor(noWalletConfig, {
        items: [{ data: Buffer.from('a') }],
      })
    ).rejects.toThrow('turboWallet is required');
  });

  it('throws with empty items', async () => {
    await expect(executeBatchAnchor(config, { items: [] })).rejects.toThrow('must not be empty');
  });

  it('anchors batch and returns merkle root + proofs', async () => {
    const items = [
      { data: Buffer.from('item-a') },
      { data: Buffer.from('item-b') },
      { data: Buffer.from('item-c') },
    ];

    const result = await executeBatchAnchor(config, { items });

    expect(result.txId).toBe('batch-tx-id');
    expect(result.merkleRoot).toBeDefined();
    expect(result.proofs).toHaveLength(3);
    expect(result.timestamp).toBeDefined();

    // Verify each proof independently
    const leafHashes = items.map((item) => sha256Hex(item.data));
    const tree = buildMerkleTree(leafHashes);

    expect(result.merkleRoot).toBe(tree.root);

    for (const p of result.proofs) {
      expect(p.hash).toBe(leafHashes[p.index]);
      const fullProof = {
        index: p.index,
        leaf: p.hash,
        path: p.proof,
        root: result.merkleRoot,
      };
      expect(verifyProof(fullProof)).toBe(true);
    }
  });

  it('passes correct tags including Merkle-Root', async () => {
    await executeBatchAnchor(config, {
      items: [{ data: Buffer.from('a') }, { data: Buffer.from('b') }],
      metadata: { Campaign: 'test-batch' },
    });

    expect(mockUploadToArweave).toHaveBeenCalledOnce();
    const callArgs = mockUploadToArweave.mock.calls[0][0];
    const tagNames = callArgs.tags.map((t: { name: string }) => t.name);

    expect(tagNames).toContain('Data-Protocol');
    expect(tagNames).toContain('Type');
    expect(tagNames).toContain('Merkle-Root');
    expect(tagNames).toContain('Leaf-Count');
    expect(tagNames).toContain('Campaign');

    const typeTag = callArgs.tags.find((t: { name: string }) => t.name === 'Type');
    expect(typeTag.value).toBe('integrity-batch-anchor');

    const leafCountTag = callArgs.tags.find((t: { name: string }) => t.name === 'Leaf-Count');
    expect(leafCountTag.value).toBe('2');
  });

  it('handles single item batch', async () => {
    const result = await executeBatchAnchor(config, {
      items: [{ data: Buffer.from('single') }],
    });

    expect(result.proofs).toHaveLength(1);
    expect(result.proofs[0].index).toBe(0);
    expect(result.merkleRoot).toBe(result.proofs[0].hash);
  });
});
