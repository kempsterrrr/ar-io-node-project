import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgenticWay } from '@agenticway/sdk';
import { executeSignAndAnchor } from '../src/operations/sign-and-anchor.js';
import { executeVerifyProvenance } from '../src/operations/verify-provenance.js';
import { executeQueryProvenance } from '../src/operations/query-provenance.js';
import { TAG_NAMES, TAG_VALUES } from '../src/tags.js';

function createMockSdk(overrides: Record<string, any> = {}): AgenticWay {
  const { gateway, ...rest } = overrides;
  return {
    store: vi.fn(),
    anchor: vi.fn(),
    verify: vi.fn(),
    query: vi.fn(),
    search: vi.fn(),
    retrieve: vi.fn(),
    resolve: vi.fn(),
    batchAnchor: vi.fn(),
    verifyAnchor: vi.fn(),
    info: vi.fn(),
    gateway: {
      fetchTransactionInfo: vi.fn(),
      ...(gateway ?? {}),
    },
    ...rest,
  } as unknown as AgenticWay;
}

describe('executeSignAndAnchor', () => {
  let sdk: AgenticWay;

  beforeEach(() => {
    sdk = createMockSdk({
      store: vi.fn().mockResolvedValue({
        txId: 'content-tx-123',
        viewUrl: 'http://localhost:3000/content-tx-123',
        provenance: {
          manifestId: 'urn:c2pa:test-manifest',
          assetHash: 'abc123hash',
        },
      }),
      anchor: vi.fn().mockResolvedValue({
        txId: 'anchor-tx-456',
        hash: 'deadbeef1234',
        timestamp: '2026-04-02T00:00:00.000Z',
      }),
    });
  });

  it('stores content with C2PA and anchors manifest metadata', async () => {
    const result = await executeSignAndAnchor(sdk, {
      data: Buffer.from('test image data'),
      sourceType: 'trainedAlgorithmicMedia',
    });

    expect(result.contentTxId).toBe('content-tx-123');
    expect(result.viewUrl).toBe('http://localhost:3000/content-tx-123');
    expect(result.manifestId).toBe('urn:c2pa:test-manifest');
    expect(result.assetHash).toBe('abc123hash');
    expect(result.anchorTxId).toBe('anchor-tx-456');
    expect(result.anchorHash).toBe('deadbeef1234');
    expect(result.timestamp).toBe('2026-04-02T00:00:00.000Z');
  });

  it('calls sdk.store with provenance options', async () => {
    await executeSignAndAnchor(sdk, {
      data: Buffer.from('test'),
      sourceType: 'trainedAlgorithmicMedia',
      claimGenerator: 'test-generator/1.0',
    });

    expect(sdk.store).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: {
          sourceType: 'trainedAlgorithmicMedia',
          claimGenerator: 'test-generator/1.0',
        },
      })
    );
  });

  it('calls sdk.anchor with provenance-specific tags', async () => {
    await executeSignAndAnchor(sdk, {
      data: Buffer.from('test'),
    });

    expect(sdk.anchor).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          [TAG_NAMES.TYPE]: TAG_VALUES.TYPE_PROVENANCE_ANCHOR,
          [TAG_NAMES.MANIFEST_ID]: 'urn:c2pa:test-manifest',
          [TAG_NAMES.ASSET_HASH]: 'abc123hash',
          [TAG_NAMES.CONTENT_TX_ID]: 'content-tx-123',
        }),
      })
    );
  });

  it('uses default claim generator when not specified', async () => {
    await executeSignAndAnchor(sdk, {
      data: Buffer.from('test'),
    });

    expect(sdk.store).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: expect.objectContaining({
          claimGenerator: '@agenticway/provenance/0.1.0',
        }),
      })
    );
  });

  it('passes custom metadata tags', async () => {
    await executeSignAndAnchor(sdk, {
      data: Buffer.from('test'),
      metadata: { 'Custom-Tag': 'custom-value' },
    });

    expect(sdk.store).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: { 'Custom-Tag': 'custom-value' },
      })
    );
  });

  it('throws if store returns no provenance', async () => {
    (sdk.store as ReturnType<typeof vi.fn>).mockResolvedValue({
      txId: 'tx-no-prov',
      viewUrl: 'http://localhost:3000/tx-no-prov',
    });

    await expect(executeSignAndAnchor(sdk, { data: Buffer.from('test') })).rejects.toThrow(
      'C2PA signing failed'
    );
  });

  it('accepts Uint8Array data', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const result = await executeSignAndAnchor(sdk, { data });
    expect(result.contentTxId).toBe('content-tx-123');
  });
});

describe('executeVerifyProvenance', () => {
  let sdk: AgenticWay;

  beforeEach(() => {
    sdk = createMockSdk({
      verify: vi.fn().mockResolvedValue({
        verificationId: 'ver-123',
        valid: true,
        tier: 'full',
        existence: {
          status: 'confirmed',
          blockHeight: 1500000,
          blockTimestamp: '2026-04-01T12:00:00.000Z',
          confirmations: 50,
        },
        integrity: { status: 'verified', hash: 'abc', match: true },
        metadata: {
          dataSize: 1024,
          contentType: 'image/jpeg',
          tags: [
            { name: 'Content-Type', value: 'image/jpeg' },
            { name: 'Protocol', value: 'C2PA-Manifest-Proof' },
            { name: 'C2PA-Manifest-ID', value: 'urn:c2pa:test-manifest' },
            { name: 'C2PA-Storage-Mode', value: 'full' },
            { name: 'C2PA-Asset-Hash', value: 'abc123' },
            { name: 'C2PA-Soft-Binding-Alg', value: 'org.ar-io.phash' },
            { name: 'C2PA-Soft-Binding-Value', value: 'AAAA' },
          ],
        },
        links: { dashboard: null, pdf: null },
      }),
      query: vi.fn().mockResolvedValue({
        edges: [
          {
            txId: 'anchor-tx-789',
            owner: 'owner-addr',
            tags: [
              { name: 'Data-Protocol', value: 'AgenticWay-Integrity' },
              { name: 'Type', value: 'integrity-provenance-anchor' },
              { name: 'Content-Tx-Id', value: 'content-tx-123' },
              { name: 'Data-Hash', value: 'deadbeef' },
            ],
            block: { height: 1500001, timestamp: 1711929600 },
            dataSize: 256,
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      }),
    });
  });

  it('verifies content with C2PA tags and anchor', async () => {
    const result = await executeVerifyProvenance(sdk, {
      contentTxId: 'content-tx-123',
    });

    expect(result.valid).toBe(true);
    expect(result.existence.status).toBe('confirmed');
    expect(result.c2pa.valid).toBe(true);
    expect(result.c2pa.manifestId).toBe('urn:c2pa:test-manifest');
    expect(result.c2pa.storageMode).toBe('full');
    expect(result.c2pa.assetHash).toBe('abc123');
    expect(result.c2pa.softBindingAlg).toBe('org.ar-io.phash');
    expect(result.anchor).not.toBeNull();
    expect(result.anchor!.valid).toBe(true);
    expect(result.anchor!.txId).toBe('anchor-tx-789');
    expect(result.anchor!.anchoredHash).toBe('deadbeef');
  });

  it('returns valid when no anchor exists', async () => {
    (sdk.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    const result = await executeVerifyProvenance(sdk, {
      contentTxId: 'content-tx-123',
    });

    expect(result.valid).toBe(true);
    expect(result.c2pa.valid).toBe(true);
    expect(result.anchor).toBeNull();
  });

  it('returns invalid when C2PA tags are missing', async () => {
    (sdk.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      verificationId: 'ver-456',
      valid: true,
      tier: 'basic',
      existence: {
        status: 'confirmed',
        blockHeight: 1500000,
        blockTimestamp: '2026-04-01T12:00:00.000Z',
        confirmations: 50,
      },
      integrity: { status: 'verified', hash: 'abc', match: true },
      metadata: {
        dataSize: 512,
        contentType: 'text/plain',
        tags: [{ name: 'Content-Type', value: 'text/plain' }],
      },
      links: { dashboard: null, pdf: null },
    });
    (sdk.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    const result = await executeVerifyProvenance(sdk, {
      contentTxId: 'non-c2pa-tx',
    });

    expect(result.valid).toBe(false);
    expect(result.c2pa.valid).toBe(false);
    expect(result.c2pa.manifestId).toBeNull();
  });

  it('returns invalid when content not found', async () => {
    (sdk.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      verificationId: 'ver-789',
      valid: false,
      tier: 'basic',
      existence: {
        status: 'not_found',
        blockHeight: null,
        blockTimestamp: null,
        confirmations: null,
      },
      integrity: { status: 'unavailable', hash: null, match: null },
      metadata: { dataSize: null, contentType: null, tags: [] },
      links: { dashboard: null, pdf: null },
    });
    (sdk.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    const result = await executeVerifyProvenance(sdk, {
      contentTxId: 'missing-tx',
    });

    expect(result.valid).toBe(false);
    expect(result.existence.status).toBe('not_found');
  });

  it('uses provided anchorTxId for direct transaction lookup', async () => {
    (sdk.gateway.fetchTransactionInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      tags: [
        { name: 'Data-Protocol', value: 'AgenticWay-Integrity' },
        { name: 'Type', value: 'integrity-provenance-anchor' },
        { name: 'Content-Tx-Id', value: 'content-tx-123' },
        { name: 'Data-Hash', value: 'deadbeef' },
      ],
      block: { height: 1500001, timestamp: 1711929600 },
    });

    const result = await executeVerifyProvenance(sdk, {
      contentTxId: 'content-tx-123',
      anchorTxId: 'anchor-tx-789',
    });

    expect(result.anchor).not.toBeNull();
    expect(result.anchor!.valid).toBe(true);
    expect(result.anchor!.txId).toBe('anchor-tx-789');
    // Should use fetchTransactionInfo, not query
    expect(sdk.gateway.fetchTransactionInfo).toHaveBeenCalledWith('anchor-tx-789');
  });

  it('extracts metadata from verification result', async () => {
    const result = await executeVerifyProvenance(sdk, {
      contentTxId: 'content-tx-123',
    });

    expect(result.metadata.dataSize).toBe(1024);
    expect(result.metadata.contentType).toBe('image/jpeg');
  });
});

describe('executeQueryProvenance', () => {
  let sdk: AgenticWay;

  beforeEach(() => {
    sdk = createMockSdk({
      query: vi.fn().mockResolvedValue({
        edges: [
          {
            txId: 'prov-tx-1',
            owner: 'owner-1',
            tags: [
              { name: 'Content-Type', value: 'image/png' },
              { name: 'Protocol', value: 'C2PA-Manifest-Proof' },
              { name: 'C2PA-Manifest-ID', value: 'urn:c2pa:manifest-1' },
              { name: 'C2PA-Storage-Mode', value: 'full' },
              { name: 'C2PA-Asset-Hash', value: 'hash-1' },
            ],
            block: { height: 1500000, timestamp: 1711929600 },
            dataSize: 2048,
          },
          {
            txId: 'prov-tx-2',
            owner: 'owner-2',
            tags: [
              { name: 'Content-Type', value: 'image/jpeg' },
              { name: 'Protocol', value: 'C2PA-Manifest-Proof' },
              { name: 'C2PA-Manifest-ID', value: 'urn:c2pa:manifest-2' },
              { name: 'C2PA-Storage-Mode', value: 'manifest' },
              { name: 'C2PA-Asset-Hash', value: 'hash-2' },
            ],
            block: { height: 1500001, timestamp: 1711929700 },
            dataSize: 4096,
          },
        ],
        pageInfo: { hasNextPage: true, endCursor: 'cursor-abc' },
      }),
    });
  });

  it('queries provenance records with C2PA protocol filter', async () => {
    await executeQueryProvenance(sdk, {});

    expect(sdk.query).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.arrayContaining([{ name: 'Protocol', values: ['C2PA-Manifest-Proof'] }]),
      })
    );
  });

  it('maps query results to ProvenanceRecord', async () => {
    const result = await executeQueryProvenance(sdk, {});

    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({
      txId: 'prov-tx-1',
      owner: 'owner-1',
      manifestId: 'urn:c2pa:manifest-1',
      contentType: 'image/png',
      storageMode: 'full',
      assetHash: 'hash-1',
      block: { height: 1500000, timestamp: 1711929600 },
      dataSize: 2048,
    });
    expect(result.records[1].storageMode).toBe('manifest');
  });

  it('passes pagination info through', async () => {
    const result = await executeQueryProvenance(sdk, {});
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.endCursor).toBe('cursor-abc');
  });

  it('adds manifest ID filter when specified', async () => {
    await executeQueryProvenance(sdk, { manifestId: 'urn:c2pa:target' });

    const callArgs = (sdk.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.tags).toContainEqual({
      name: 'C2PA-Manifest-ID',
      values: ['urn:c2pa:target'],
    });
  });

  it('adds content type filter when specified', async () => {
    await executeQueryProvenance(sdk, { contentType: 'image/jpeg' });

    const callArgs = (sdk.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.tags).toContainEqual({
      name: 'Content-Type',
      values: ['image/jpeg'],
    });
  });

  it('adds owner filter when specified', async () => {
    await executeQueryProvenance(sdk, { owner: 'owner-1' });

    const callArgs = (sdk.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.owners).toEqual(['owner-1']);
  });

  it('passes pagination parameters through', async () => {
    await executeQueryProvenance(sdk, {
      first: 50,
      after: 'cursor-xyz',
      sort: 'HEIGHT_ASC',
    });

    expect(sdk.query).toHaveBeenCalledWith(
      expect.objectContaining({
        first: 50,
        after: 'cursor-xyz',
        sort: 'HEIGHT_ASC',
      })
    );
  });
});
