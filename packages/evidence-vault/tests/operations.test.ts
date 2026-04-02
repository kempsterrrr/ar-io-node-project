import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sha256Hex } from '@agenticway/sdk';
import { executeAnchorEvidence } from '../src/operations/anchor-evidence.js';
import { executeBatchAnchorEvidence } from '../src/operations/batch-anchor-evidence.js';
import { executeVerifyEvidence } from '../src/operations/verify-evidence.js';
import { executeQueryEvidence } from '../src/operations/query-evidence.js';
import { executeAuditorVerify } from '../src/operations/auditor-verify.js';
import { MemoryStorageAdapter } from '../src/storage/memory.js';
import { TAG_NAMES, TAG_VALUES } from '../src/tags.js';

/** Create a mock AgenticWay SDK instance. */
function createMockSdk() {
  return {
    anchor: vi.fn(),
    batchAnchor: vi.fn(),
    verifyAnchor: vi.fn(),
    query: vi.fn(),
    gateway: {
      fetchTransactionInfo: vi.fn(),
    },
  } as any;
}

describe('anchorEvidence', () => {
  let sdk: ReturnType<typeof createMockSdk>;

  beforeEach(() => {
    sdk = createMockSdk();
    sdk.anchor.mockResolvedValue({
      txId: 'ev-tx-001',
      hash: sha256Hex(Buffer.from('test policy')),
      timestamp: '2026-04-02T00:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('anchors evidence with AIUC-1 metadata', async () => {
    const result = await executeAnchorEvidence(sdk, {
      data: Buffer.from('test policy'),
      controlId: 'S001',
      evidenceType: 'policy-document',
      label: 'Access Control Policy',
    });

    expect(result.txId).toBe('ev-tx-001');
    expect(result.controlId).toBe('S001');
    expect(result.domain).toBe('security');
    expect(result.evidenceType).toBe('policy-document');
    expect(result.timestamp).toBeDefined();
  });

  it('passes AIUC-1 tags to the SDK anchor call', async () => {
    await executeAnchorEvidence(sdk, {
      data: Buffer.from('test'),
      controlId: 'S001',
      evidenceType: 'policy-document',
      label: 'My Policy',
      organizationId: 'org-123',
    });

    expect(sdk.anchor).toHaveBeenCalledOnce();
    const metadata = sdk.anchor.mock.calls[0][0].metadata;

    expect(metadata[TAG_NAMES.TYPE]).toBe(TAG_VALUES.TYPE_EVIDENCE);
    expect(metadata[TAG_NAMES.AIUC1_CONTROL_ID]).toBe('S001');
    expect(metadata[TAG_NAMES.AIUC1_DOMAIN]).toBe('security');
    expect(metadata[TAG_NAMES.EVIDENCE_TYPE]).toBe('policy-document');
    expect(metadata[TAG_NAMES.EVIDENCE_LABEL]).toBe('My Policy');
    expect(metadata[TAG_NAMES.ORGANIZATION_ID]).toBe('org-123');
  });

  it('throws for unknown control ID', async () => {
    await expect(
      executeAnchorEvidence(sdk, {
        data: Buffer.from('test'),
        controlId: 'UNKNOWN',
        evidenceType: 'policy-document',
      })
    ).rejects.toThrow('Unknown AIUC-1 control ID: UNKNOWN');
  });

  it('passes custom metadata through', async () => {
    await executeAnchorEvidence(sdk, {
      data: Buffer.from('test'),
      controlId: 'S001',
      evidenceType: 'policy-document',
      metadata: { 'Custom-Tag': 'custom-value' },
    });

    const metadata = sdk.anchor.mock.calls[0][0].metadata;
    expect(metadata['Custom-Tag']).toBe('custom-value');
  });

  it('works with all 6 domains', async () => {
    const domainControls = [
      { controlId: 'S001', domain: 'security' },
      { controlId: 'SF001', domain: 'safety' },
      { controlId: 'R001', domain: 'reliability' },
      { controlId: 'E001', domain: 'accountability' },
      { controlId: 'D001', domain: 'data-privacy' },
      { controlId: 'A001', domain: 'society' },
    ];

    for (const { controlId, domain } of domainControls) {
      const result = await executeAnchorEvidence(sdk, {
        data: Buffer.from(`evidence for ${domain}`),
        controlId,
        evidenceType: 'policy-document',
      });
      expect(result.domain).toBe(domain);
    }
  });
});

describe('batchAnchorEvidence', () => {
  let sdk: ReturnType<typeof createMockSdk>;

  beforeEach(() => {
    sdk = createMockSdk();
    sdk.batchAnchor.mockResolvedValue({
      txId: 'batch-tx-001',
      merkleRoot: 'abc123root',
      proofs: [
        { index: 0, hash: 'hash0', proof: [{ hash: 'sibling0', position: 'right' }] },
        { index: 1, hash: 'hash1', proof: [{ hash: 'sibling1', position: 'left' }] },
      ],
      timestamp: '2026-04-02T00:00:00.000Z',
    });
  });

  it('batch-anchors evidence with enriched proofs', async () => {
    const result = await executeBatchAnchorEvidence(sdk, {
      items: [
        { data: Buffer.from('policy'), controlId: 'S001', evidenceType: 'policy-document' },
        { data: Buffer.from('test'), controlId: 'R001', evidenceType: 'test-result' },
      ],
    });

    expect(result.txId).toBe('batch-tx-001');
    expect(result.merkleRoot).toBe('abc123root');
    expect(result.proofs).toHaveLength(2);

    expect(result.proofs[0].controlId).toBe('S001');
    expect(result.proofs[0].evidenceType).toBe('policy-document');
    expect(result.proofs[1].controlId).toBe('R001');
    expect(result.proofs[1].evidenceType).toBe('test-result');
  });

  it('includes batch-level domain and control metadata', async () => {
    await executeBatchAnchorEvidence(sdk, {
      items: [
        { data: Buffer.from('a'), controlId: 'S001', evidenceType: 'policy-document' },
        { data: Buffer.from('b'), controlId: 'R001', evidenceType: 'test-result' },
      ],
      organizationId: 'org-456',
    });

    const metadata = sdk.batchAnchor.mock.calls[0][0].metadata;
    expect(metadata[TAG_NAMES.TYPE]).toBe(TAG_VALUES.TYPE_EVIDENCE_BATCH);
    expect(metadata['AIUC1-Domains']).toContain('security');
    expect(metadata['AIUC1-Domains']).toContain('reliability');
    expect(metadata['AIUC1-Control-Ids']).toContain('S001');
    expect(metadata['AIUC1-Control-Ids']).toContain('R001');
    expect(metadata[TAG_NAMES.ORGANIZATION_ID]).toBe('org-456');
  });

  it('throws for empty items array', async () => {
    await expect(executeBatchAnchorEvidence(sdk, { items: [] })).rejects.toThrow(
      'must not be empty'
    );
  });

  it('throws for unknown control ID', async () => {
    await expect(
      executeBatchAnchorEvidence(sdk, {
        items: [{ data: Buffer.from('x'), controlId: 'UNKNOWN', evidenceType: 'other' }],
      })
    ).rejects.toThrow('Unknown AIUC-1 control ID');
  });
});

describe('verifyEvidence', () => {
  let sdk: ReturnType<typeof createMockSdk>;

  beforeEach(() => {
    sdk = createMockSdk();
  });

  it('returns valid result with AIUC-1 metadata', async () => {
    const data = Buffer.from('verified policy');
    sdk.verifyAnchor.mockResolvedValue({
      valid: true,
      hash: sha256Hex(data),
      anchoredHash: sha256Hex(data),
      blockHeight: 1500000,
      timestamp: '2026-04-02T00:00:00.000Z',
    });
    sdk.gateway.fetchTransactionInfo.mockResolvedValue({
      tags: [
        { name: TAG_NAMES.AIUC1_CONTROL_ID, value: 'S001' },
        { name: TAG_NAMES.AIUC1_DOMAIN, value: 'security' },
        { name: TAG_NAMES.EVIDENCE_TYPE, value: 'policy-document' },
      ],
      block: { height: 1500000, timestamp: 1712016000 },
    });

    const result = await executeVerifyEvidence(sdk, { data, txId: 'ev-tx-001' });

    expect(result.valid).toBe(true);
    expect(result.hash).toBe(sha256Hex(data));
    expect(result.controlId).toBe('S001');
    expect(result.domain).toBe('security');
    expect(result.evidenceType).toBe('policy-document');
    expect(result.blockHeight).toBe(1500000);
  });

  it('returns invalid when data has been tampered', async () => {
    sdk.verifyAnchor.mockResolvedValue({
      valid: false,
      hash: sha256Hex(Buffer.from('tampered')),
      anchoredHash: sha256Hex(Buffer.from('original')),
      blockHeight: 1500000,
      timestamp: '2026-04-02T00:00:00.000Z',
    });
    sdk.gateway.fetchTransactionInfo.mockResolvedValue({
      tags: [{ name: TAG_NAMES.AIUC1_CONTROL_ID, value: 'S001' }],
      block: { height: 1500000, timestamp: 1712016000 },
    });

    const result = await executeVerifyEvidence(sdk, {
      data: Buffer.from('tampered'),
      txId: 'ev-tx-001',
    });

    expect(result.valid).toBe(false);
  });

  it('handles missing AIUC-1 tags gracefully', async () => {
    sdk.verifyAnchor.mockResolvedValue({
      valid: true,
      hash: 'abc',
      anchoredHash: 'abc',
      blockHeight: null,
      timestamp: null,
    });
    sdk.gateway.fetchTransactionInfo.mockResolvedValue({
      tags: [],
      block: null,
    });

    const result = await executeVerifyEvidence(sdk, {
      data: Buffer.from('test'),
      txId: 'tx-123',
    });

    expect(result.controlId).toBeNull();
    expect(result.domain).toBeNull();
    expect(result.evidenceType).toBeNull();
  });
});

describe('queryEvidence', () => {
  let sdk: ReturnType<typeof createMockSdk>;

  beforeEach(() => {
    sdk = createMockSdk();
    sdk.query.mockResolvedValue({
      edges: [
        {
          txId: 'tx-1',
          owner: 'owner-1',
          tags: [
            { name: TAG_NAMES.AIUC1_CONTROL_ID, value: 'S001' },
            { name: TAG_NAMES.AIUC1_DOMAIN, value: 'security' },
            { name: TAG_NAMES.EVIDENCE_TYPE, value: 'policy-document' },
            { name: TAG_NAMES.EVIDENCE_LABEL, value: 'Access Control Policy' },
            { name: TAG_NAMES.ORGANIZATION_ID, value: 'org-123' },
          ],
          block: { height: 1500000, timestamp: 1712016000 },
          dataSize: 256,
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  it('queries with AIUC-1 filters', async () => {
    const result = await executeQueryEvidence(sdk, {
      domain: 'security',
      controlId: 'S001',
    });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].controlId).toBe('S001');
    expect(result.edges[0].domain).toBe('security');
    expect(result.edges[0].evidenceType).toBe('policy-document');
    expect(result.edges[0].label).toBe('Access Control Policy');
    expect(result.edges[0].organizationId).toBe('org-123');
  });

  it('passes protocol tags to SDK query', async () => {
    await executeQueryEvidence(sdk, { domain: 'security' });

    const queryTags = sdk.query.mock.calls[0][0].tags;
    const protocolTag = queryTags.find((t: { name: string }) => t.name === TAG_NAMES.PROTOCOL);
    expect(protocolTag.values).toContain(TAG_VALUES.PROTOCOL);

    const domainTag = queryTags.find((t: { name: string }) => t.name === TAG_NAMES.AIUC1_DOMAIN);
    expect(domainTag.values).toContain('security');
  });

  it('queries without filters returns all evidence', async () => {
    await executeQueryEvidence(sdk, {});

    const queryTags = sdk.query.mock.calls[0][0].tags;
    // Should have protocol + type tags but no domain/control filters
    expect(queryTags).toHaveLength(2);
  });

  it('passes pagination options', async () => {
    await executeQueryEvidence(sdk, {
      first: 50,
      after: 'cursor-abc',
      sort: 'HEIGHT_ASC',
    });

    const queryOpts = sdk.query.mock.calls[0][0];
    expect(queryOpts.first).toBe(50);
    expect(queryOpts.after).toBe('cursor-abc');
    expect(queryOpts.sort).toBe('HEIGHT_ASC');
  });
});

describe('auditorVerify', () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    sdk = createMockSdk();
    storage = new MemoryStorageAdapter();
  });

  it('retrieves evidence from storage and verifies against anchor', async () => {
    const evidenceData = Buffer.from('original evidence content');
    await storage.store('compliance/S001/policy.pdf', evidenceData);

    sdk.verifyAnchor.mockResolvedValue({
      valid: true,
      hash: sha256Hex(evidenceData),
      anchoredHash: sha256Hex(evidenceData),
      blockHeight: 1500000,
      timestamp: '2026-04-02T00:00:00.000Z',
    });
    sdk.gateway.fetchTransactionInfo.mockResolvedValue({
      tags: [
        { name: TAG_NAMES.AIUC1_CONTROL_ID, value: 'S001' },
        { name: TAG_NAMES.AIUC1_DOMAIN, value: 'security' },
        { name: TAG_NAMES.EVIDENCE_TYPE, value: 'policy-document' },
      ],
      block: { height: 1500000, timestamp: 1712016000 },
    });

    const result = await executeAuditorVerify(sdk, storage, {
      storageKey: 'compliance/S001/policy.pdf',
      txId: 'ev-tx-001',
    });

    expect(result.valid).toBe(true);
    expect(result.storageKey).toBe('compliance/S001/policy.pdf');
    expect(result.controlId).toBe('S001');
    expect(result.domain).toBe('security');
  });

  it('detects tampered evidence', async () => {
    const originalData = Buffer.from('original');
    const tamperedData = Buffer.from('tampered');
    await storage.store('evidence.pdf', tamperedData);

    sdk.verifyAnchor.mockResolvedValue({
      valid: false,
      hash: sha256Hex(tamperedData),
      anchoredHash: sha256Hex(originalData),
      blockHeight: 1500000,
      timestamp: '2026-04-02T00:00:00.000Z',
    });
    sdk.gateway.fetchTransactionInfo.mockResolvedValue({
      tags: [],
      block: { height: 1500000, timestamp: 1712016000 },
    });

    const result = await executeAuditorVerify(sdk, storage, {
      storageKey: 'evidence.pdf',
      txId: 'ev-tx-002',
    });

    expect(result.valid).toBe(false);
  });

  it('throws when storage key does not exist', async () => {
    await expect(
      executeAuditorVerify(sdk, storage, {
        storageKey: 'nonexistent.pdf',
        txId: 'ev-tx-003',
      })
    ).rejects.toThrow('Key not found');
  });
});
