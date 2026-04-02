import { describe, it, expect, vi } from 'vitest';
import { EvidenceVault } from '../src/evidence-vault.js';

// Mock the AgenticWay SDK
vi.mock('@agenticway/sdk', () => ({
  AgenticWay: vi.fn().mockImplementation(() => ({
    anchor: vi.fn().mockResolvedValue({
      txId: 'vault-tx-001',
      hash: 'abcdef1234567890',
      timestamp: '2026-04-02T00:00:00.000Z',
    }),
    batchAnchor: vi.fn().mockResolvedValue({
      txId: 'vault-batch-001',
      merkleRoot: 'root-hash',
      proofs: [{ index: 0, hash: 'leaf-hash', proof: [] }],
      timestamp: '2026-04-02T00:00:00.000Z',
    }),
    verifyAnchor: vi.fn().mockResolvedValue({
      valid: true,
      hash: 'abc',
      anchoredHash: 'abc',
      blockHeight: 1500000,
      timestamp: '2026-04-02T00:00:00.000Z',
    }),
    query: vi.fn().mockResolvedValue({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    gateway: {
      fetchTransactionInfo: vi.fn().mockResolvedValue({
        tags: [],
        block: null,
      }),
    },
  })),
  sha256Hex: vi.fn().mockReturnValue('mocked-hash'),
}));

describe('EvidenceVault', () => {
  it('constructs with minimal config', () => {
    const vault = new EvidenceVault({
      gatewayUrl: 'http://localhost:3000',
    });
    expect(vault).toBeDefined();
  });

  it('anchorEvidence delegates to SDK and enriches result', async () => {
    const vault = new EvidenceVault({
      gatewayUrl: 'http://localhost:3000',
      turboWallet: '0xdeadbeef',
    });

    const result = await vault.anchorEvidence({
      data: Buffer.from('policy doc'),
      controlId: 'S001',
      evidenceType: 'policy-document',
    });

    expect(result.txId).toBe('vault-tx-001');
    expect(result.controlId).toBe('S001');
    expect(result.domain).toBe('security');
  });

  it('batchAnchorEvidence delegates to SDK', async () => {
    const vault = new EvidenceVault({
      gatewayUrl: 'http://localhost:3000',
      turboWallet: '0xdeadbeef',
    });

    const result = await vault.batchAnchorEvidence({
      items: [{ data: Buffer.from('item'), controlId: 'S001', evidenceType: 'policy-document' }],
    });

    expect(result.txId).toBe('vault-batch-001');
    expect(result.proofs).toHaveLength(1);
    expect(result.proofs[0].controlId).toBe('S001');
  });

  it('queryEvidence delegates to SDK', async () => {
    const vault = new EvidenceVault({
      gatewayUrl: 'http://localhost:3000',
    });

    const result = await vault.queryEvidence({ domain: 'security' });
    expect(result.edges).toBeDefined();
    expect(result.pageInfo).toBeDefined();
  });

  it('verifyEvidence delegates to SDK', async () => {
    const vault = new EvidenceVault({
      gatewayUrl: 'http://localhost:3000',
    });

    const result = await vault.verifyEvidence({
      data: Buffer.from('test'),
      txId: 'tx-001',
    });

    expect(result.valid).toBe(true);
  });

  it('auditorVerify throws without storage adapter', async () => {
    const vault = new EvidenceVault({
      gatewayUrl: 'http://localhost:3000',
    });

    await expect(vault.auditorVerify({ storageKey: 'file.pdf', txId: 'tx-001' })).rejects.toThrow(
      'storage adapter is required'
    );
  });
});
