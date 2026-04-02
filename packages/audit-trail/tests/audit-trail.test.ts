import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditTrail } from '../src/audit-trail.js';

// Mock the SDK
vi.mock('@agenticway/sdk', () => ({
  AgenticWay: vi.fn().mockImplementation(() => ({
    batchAnchor: vi.fn().mockResolvedValue({
      txId: 'tx-batch-001',
      merkleRoot: 'abc123root',
      proofs: [
        { index: 0, hash: 'hash-0', proof: [{ hash: 'sibling-0', position: 'right' }] },
        { index: 1, hash: 'hash-1', proof: [{ hash: 'sibling-1', position: 'left' }] },
      ],
      timestamp: '2026-04-01T00:00:00.000Z',
    }),
    verifyAnchor: vi.fn().mockResolvedValue({
      valid: true,
      hash: 'entry-hash-hex',
      anchoredHash: 'entry-hash-hex',
      blockHeight: 1500000,
      timestamp: '2026-04-01T00:00:00.000Z',
    }),
    query: vi.fn().mockResolvedValue({
      edges: [
        {
          txId: 'tx-batch-001',
          owner: 'owner-addr',
          tags: [
            { name: 'Data-Protocol', value: 'AgenticWay-Integrity' },
            { name: 'Type', value: 'integrity-audit-batch' },
            { name: 'Agent-Id', value: 'agent-1' },
            { name: 'Session-Id', value: 'session-abc' },
            { name: 'Event-Types', value: 'tool_call,tool_result' },
            { name: 'Entry-Count', value: '2' },
          ],
          block: { height: 1500000, timestamp: 1711929600 },
          dataSize: 512,
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
  })),
}));

describe('AuditTrail', () => {
  let trail: AuditTrail;

  beforeEach(() => {
    trail = new AuditTrail({
      gatewayUrl: 'http://localhost:3000',
      turboWallet: '0xdeadbeef',
      agentId: 'agent-1',
      sessionId: 'session-abc',
      batch: { autoFlush: false }, // Disable auto-flush for deterministic tests
    });
  });

  afterEach(() => {
    trail.destroy();
  });

  it('constructs with minimal config', () => {
    const t = new AuditTrail({
      gatewayUrl: 'http://localhost:3000',
      agentId: 'agent-1',
      batch: { autoFlush: false },
    });
    expect(t).toBeDefined();
    expect(t.pending).toBe(0);
    t.destroy();
  });

  it('log() adds entries and returns entry ID', async () => {
    const id = await trail.log({
      eventType: 'tool_call',
      action: 'Tool call: arweaveStore',
      input: { data: 'hello' },
    });

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(trail.pending).toBe(1);
  });

  it('log() uses default agentId and sessionId', async () => {
    await trail.log({
      eventType: 'decision',
      action: 'Agent decided to store data',
    });

    expect(trail.pending).toBe(1);
  });

  it('log() allows overriding agentId and sessionId', async () => {
    await trail.log({
      eventType: 'tool_call',
      action: 'Cross-agent call',
      agentId: 'agent-2',
      sessionId: 'session-xyz',
    });

    expect(trail.pending).toBe(1);
  });

  it('flush() anchors batch and returns result', async () => {
    await trail.log({
      eventType: 'tool_call',
      action: 'Tool call: store',
      input: { data: 'test' },
    });
    await trail.log({
      eventType: 'tool_result',
      action: 'Tool result: store',
      output: { txId: 'tx-123' },
    });

    const result = await trail.flush();

    expect(result).not.toBeNull();
    expect(result!.txId).toBe('tx-batch-001');
    expect(result!.merkleRoot).toBe('abc123root');
    expect(result!.entryCount).toBe(2);
    expect(result!.proofs.size).toBe(2);
    expect(trail.pending).toBe(0);
  });

  it('flush() returns null when no entries pending', async () => {
    const result = await trail.flush();
    expect(result).toBeNull();
  });

  it('verifyEntry() delegates to SDK verifyAnchor', async () => {
    const result = await trail.verifyEntry({
      entry: {
        id: 'entry-001',
        timestamp: '2026-04-01T00:00:00.000Z',
        agentId: 'agent-1',
        eventType: 'tool_call',
        action: 'Tool call: store',
      },
      txId: 'tx-batch-001',
    });

    expect(result.valid).toBe(true);
    expect(result.entryHash).toBeDefined();
    expect(result.blockHeight).toBe(1500000);
  });

  it('queryLogs() returns enriched edges', async () => {
    const result = await trail.queryLogs({ agentId: 'agent-1' });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].txId).toBe('tx-batch-001');
    expect(result.edges[0].agentId).toBe('agent-1');
    expect(result.edges[0].sessionId).toBe('session-abc');
    expect(result.edges[0].eventTypes).toBe('tool_call,tool_result');
    expect(result.edges[0].entryCount).toBe('2');
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it('onEvent() is an alias for log()', async () => {
    const id = await trail.onEvent({
      eventType: 'error',
      action: 'Something went wrong',
    });

    expect(id).toBeDefined();
    expect(trail.pending).toBe(1);
  });

  it('lastFlush is null before first flush', () => {
    expect(trail.lastFlush).toBeNull();
  });

  it('lastFlush is updated after flush', async () => {
    await trail.log({ eventType: 'decision', action: 'test' });
    await trail.flush();
    expect(trail.lastFlush).not.toBeNull();
    expect(trail.lastFlush!.txId).toBe('tx-batch-001');
  });
});
