import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchManager } from '../src/batcher/batch-manager.js';
import type { AuditLogEntry } from '../src/types.js';

function makeEntry(overrides?: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    agentId: 'agent-1',
    eventType: 'tool_call',
    action: 'test action',
    ...overrides,
  };
}

describe('BatchManager', () => {
  let flushed: AuditLogEntry[][];
  let onFlush: (entries: AuditLogEntry[]) => Promise<void>;

  beforeEach(() => {
    flushed = [];
    onFlush = vi.fn(async (entries: AuditLogEntry[]) => {
      flushed.push(entries);
    });
  });

  it('starts with zero pending entries', () => {
    const bm = new BatchManager({ autoFlush: false }, onFlush);
    expect(bm.pending).toBe(0);
    bm.destroy();
  });

  it('add() increments pending count', () => {
    const bm = new BatchManager({ autoFlush: false }, onFlush);
    bm.add(makeEntry());
    bm.add(makeEntry());
    expect(bm.pending).toBe(2);
    bm.destroy();
  });

  it('flush() calls onFlush with all entries and resets', async () => {
    const bm = new BatchManager({ autoFlush: false }, onFlush);
    bm.add(makeEntry({ id: 'a' }));
    bm.add(makeEntry({ id: 'b' }));

    await bm.flush();

    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(2);
    expect(flushed[0][0].id).toBe('a');
    expect(flushed[0][1].id).toBe('b');
    expect(bm.pending).toBe(0);
  });

  it('flush() is a no-op when empty', async () => {
    const bm = new BatchManager({ autoFlush: false }, onFlush);
    await bm.flush();
    expect(onFlush).not.toHaveBeenCalled();
    bm.destroy();
  });

  it('auto-flushes on maxEntries', async () => {
    const bm = new BatchManager({ maxEntries: 3, autoFlush: true }, onFlush);

    bm.add(makeEntry());
    bm.add(makeEntry());
    expect(bm.pending).toBe(2);
    expect(onFlush).not.toHaveBeenCalled();

    bm.add(makeEntry()); // Triggers flush

    // Wait for the async flush to complete
    await vi.waitFor(() => expect(onFlush).toHaveBeenCalledTimes(1));
    expect(flushed[0]).toHaveLength(3);
    bm.destroy();
  });

  it('auto-flushes on interval', async () => {
    vi.useFakeTimers();

    const bm = new BatchManager({ maxIntervalMs: 100, autoFlush: true }, onFlush);
    bm.add(makeEntry());

    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(flushed[0]).toHaveLength(1);

    bm.destroy();
    vi.useRealTimers();
  });

  it('destroy() clears pending entries', () => {
    const bm = new BatchManager({ autoFlush: false }, onFlush);
    bm.add(makeEntry());
    bm.add(makeEntry());
    bm.destroy();
    expect(bm.pending).toBe(0);
  });
});
