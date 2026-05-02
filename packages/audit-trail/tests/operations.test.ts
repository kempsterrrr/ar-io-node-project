import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { serializeEntry } from '../src/operations/flush-batch.js';
import { executeFlushBatch } from '../src/operations/flush-batch.js';
import { executeVerifyEntry } from '../src/operations/verify-entry.js';
import { executeQueryLogs } from '../src/operations/query-logs.js';
import type { AuditLogEntry } from '../src/types.js';
import type { AgenticWay } from '@agenticway/sdk';

// Real sha256Hex for computing expected hashes in tests
function sha256HexLocal(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// Mock sha256Hex from SDK (used by verify-entry)
vi.mock('@agenticway/sdk', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    sha256Hex: (data: Buffer | Uint8Array) => createHash('sha256').update(data).digest('hex'),
  };
});

function makeEntry(overrides?: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: 'entry-001',
    timestamp: '2026-04-01T12:00:00.000Z',
    agentId: 'agent-1',
    eventType: 'tool_call',
    action: 'Tool call: store',
    ...overrides,
  };
}

function makeMockSdk(overrides?: Record<string, unknown>) {
  return {
    batchAnchor: vi.fn().mockResolvedValue({
      txId: 'tx-001',
      merkleRoot: 'root-hex',
      proofs: [{ index: 0, hash: 'hash-0', proof: [{ hash: 's0', position: 'right' }] }],
      timestamp: '2026-04-01T12:00:00.000Z',
    }),
    gateway: {
      fetchTransactionInfo: vi.fn().mockImplementation(async () => ({
        tags: [
          { name: 'Data-Protocol', value: 'AgenticWay-Integrity' },
          { name: 'Type', value: 'integrity-audit-batch' },
          { name: 'Merkle-Root', value: 'will-be-overridden' },
        ],
        block: { height: 1500000, timestamp: 1711929600 },
      })),
    },
    query: vi.fn().mockResolvedValue({
      edges: [
        {
          txId: 'tx-001',
          owner: 'owner',
          tags: [
            { name: 'Data-Protocol', value: 'AgenticWay-Integrity' },
            { name: 'Type', value: 'integrity-audit-batch' },
            { name: 'Agent-Id', value: 'agent-1' },
            { name: 'Entry-Count', value: '1' },
          ],
          block: { height: 1500000, timestamp: 1711929600 },
          dataSize: 256,
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    ...overrides,
  } as unknown as AgenticWay;
}

describe('serializeEntry', () => {
  it('produces deterministic JSON', () => {
    const entry = makeEntry();
    const buf1 = serializeEntry(entry);
    const buf2 = serializeEntry(entry);
    expect(buf1.toString('utf-8')).toBe(buf2.toString('utf-8'));
  });

  it('includes all fields in a fixed order', () => {
    const entry = makeEntry({
      input: { data: 'test' },
      output: { txId: 'tx-1' },
      metadata: { key: 'val' },
      parentEventId: 'parent-001',
      sessionId: 'sess-1',
    });

    const parsed = JSON.parse(serializeEntry(entry).toString('utf-8'));
    const keys = Object.keys(parsed);
    expect(keys).toEqual([
      'id',
      'timestamp',
      'agentId',
      'sessionId',
      'eventType',
      'action',
      'input',
      'output',
      'metadata',
      'parentEventId',
    ]);
  });

  it('normalizes optional fields to null', () => {
    const entry = makeEntry();
    const parsed = JSON.parse(serializeEntry(entry).toString('utf-8'));
    expect(parsed.sessionId).toBeNull();
    expect(parsed.input).toBeNull();
    expect(parsed.output).toBeNull();
    expect(parsed.metadata).toBeNull();
    expect(parsed.parentEventId).toBeNull();
  });
});

describe('executeFlushBatch', () => {
  it('throws on empty batch', async () => {
    const sdk = makeMockSdk();
    await expect(executeFlushBatch(sdk, [])).rejects.toThrow('Cannot flush an empty batch');
  });

  it('calls batchAnchor with serialized entries and metadata tags', async () => {
    const sdk = makeMockSdk();
    const entry = makeEntry();

    const result = await executeFlushBatch(sdk, [entry]);

    expect(sdk.batchAnchor).toHaveBeenCalledOnce();
    const call = vi.mocked(sdk.batchAnchor).mock.calls[0][0];
    expect(call.items).toHaveLength(1);
    expect(call.metadata).toMatchObject({
      Type: 'integrity-audit-batch',
      'Agent-Id': 'agent-1',
      'Event-Types': 'tool_call',
      'Entry-Count': '1',
    });

    expect(result.txId).toBe('tx-001');
    expect(result.merkleRoot).toBe('root-hex');
    expect(result.entryCount).toBe(1);
    expect(result.proofs.size).toBe(1);
    expect(result.proofs.get('entry-001')!.hash).toBe('hash-0');
  });

  it('includes session ID tag when present', async () => {
    const sdk = makeMockSdk();
    const entry = makeEntry({ sessionId: 'sess-1' });

    await executeFlushBatch(sdk, [entry]);

    const call = vi.mocked(sdk.batchAnchor).mock.calls[0][0];
    expect(call.metadata!['Session-Id']).toBe('sess-1');
  });

  it('deduplicates event types and agent IDs in tags', async () => {
    const sdk = makeMockSdk({
      batchAnchor: vi.fn().mockResolvedValue({
        txId: 'tx-002',
        merkleRoot: 'root-2',
        proofs: [
          { index: 0, hash: 'h0', proof: [] },
          { index: 1, hash: 'h1', proof: [] },
        ],
        timestamp: '2026-04-01T12:00:00.000Z',
      }),
    });

    await executeFlushBatch(sdk, [
      makeEntry({ id: 'e1', eventType: 'tool_call', agentId: 'agent-1' }),
      makeEntry({ id: 'e2', eventType: 'tool_call', agentId: 'agent-1' }),
    ]);

    const call = vi.mocked(sdk.batchAnchor).mock.calls[0][0];
    expect(call.metadata!['Event-Types']).toBe('tool_call');
    expect(call.metadata!['Agent-Id']).toBe('agent-1');
  });
});

describe('executeVerifyEntry', () => {
  it('verifies entry hash, Merkle proof, and on-chain root', async () => {
    const entry = makeEntry();
    const entryHash = sha256HexLocal(serializeEntry(entry));
    const siblingHash = 'aabbccdd';

    // Compute expected Merkle root: hash(entryHash || siblingHash)
    const combined = Buffer.concat([
      Buffer.from(entryHash, 'hex'),
      Buffer.from(siblingHash, 'hex'),
    ]);
    const expectedRoot = sha256HexLocal(combined);

    const sdk = makeMockSdk({
      gateway: {
        fetchTransactionInfo: vi.fn().mockResolvedValue({
          tags: [{ name: 'Merkle-Root', value: expectedRoot }],
          block: { height: 1500000, timestamp: 1711929600 },
        }),
      },
    });

    const result = await executeVerifyEntry(sdk, {
      entry,
      txId: 'tx-001',
      proof: {
        entryId: entry.id,
        index: 0,
        hash: entryHash,
        proof: [{ hash: siblingHash, position: 'right' as const }],
      },
    });

    expect(result.valid).toBe(true);
    expect(result.entryHash).toBe(entryHash);
    expect(result.merkleProofValid).toBe(true);
    expect(result.onChainValid).toBe(true);
    expect(result.blockHeight).toBe(1500000);
  });

  it('short-circuits when entry hash does not match proof (no gateway call)', async () => {
    const entry = makeEntry();

    const fetchMock = vi.fn();
    const sdk = makeMockSdk({
      gateway: { fetchTransactionInfo: fetchMock },
    });

    const result = await executeVerifyEntry(sdk, {
      entry,
      txId: 'tx-001',
      proof: {
        entryId: entry.id,
        index: 0,
        hash: 'wrong-hash',
        proof: [],
      },
    });

    expect(result.merkleProofValid).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.onChainValid).toBe(false);
    // Should NOT have called the gateway
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('short-circuits when entry ID does not match proof (no gateway call)', async () => {
    const entry = makeEntry();
    const entryHash = sha256HexLocal(serializeEntry(entry));

    const fetchMock = vi.fn();
    const sdk = makeMockSdk({
      gateway: { fetchTransactionInfo: fetchMock },
    });

    const result = await executeVerifyEntry(sdk, {
      entry,
      txId: 'tx-001',
      proof: {
        entryId: 'wrong-entry-id',
        index: 0,
        hash: entryHash,
        proof: [],
      },
    });

    expect(result.valid).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns invalid when on-chain root does not match', async () => {
    const entry = makeEntry();
    const entryHash = sha256HexLocal(serializeEntry(entry));

    const sdk = makeMockSdk({
      gateway: {
        fetchTransactionInfo: vi.fn().mockResolvedValue({
          tags: [{ name: 'Merkle-Root', value: 'mismatched-root' }],
          block: { height: 1500000, timestamp: 1711929600 },
        }),
      },
    });

    const result = await executeVerifyEntry(sdk, {
      entry,
      txId: 'tx-001',
      proof: {
        entryId: entry.id,
        index: 0,
        hash: entryHash,
        proof: [],
      },
    });

    expect(result.merkleProofValid).toBe(true);
    expect(result.onChainValid).toBe(false);
    expect(result.valid).toBe(false);
  });
});

describe('executeQueryLogs', () => {
  it('queries with protocol and type tags by default', async () => {
    const sdk = makeMockSdk();

    const result = await executeQueryLogs(sdk);

    expect(sdk.query).toHaveBeenCalledOnce();
    const call = vi.mocked(sdk.query).mock.calls[0][0];
    expect(call.tags).toEqual([
      { name: 'Data-Protocol', values: ['AgenticWay-Integrity'] },
      { name: 'Type', values: ['integrity-audit-batch'] },
    ]);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].agentId).toBe('agent-1');
    expect(result.edges[0].entryCount).toBe('1');
  });

  it('adds filter tags for agentId and eventTypes', async () => {
    const sdk = makeMockSdk();

    await executeQueryLogs(sdk, {
      agentId: 'agent-1',
      eventTypes: ['tool_call', 'error'],
    });

    const call = vi.mocked(sdk.query).mock.calls[0][0];
    expect(call.tags).toContainEqual({ name: 'Agent-Id', values: ['agent-1'] });
    expect(call.tags).toContainEqual({ name: 'Event-Types', values: ['tool_call', 'error'] });
  });

  it('adds filter tag for sessionId', async () => {
    const sdk = makeMockSdk();

    await executeQueryLogs(sdk, { sessionId: 'sess-1' });

    const call = vi.mocked(sdk.query).mock.calls[0][0];
    expect(call.tags).toContainEqual({ name: 'Session-Id', values: ['sess-1'] });
  });
});
