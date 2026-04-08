import type { AgenticWay } from '@agenticway/sdk';
import type { AuditLogEntry, FlushResult, EntryProof } from '../types.js';
import { TAG_NAMES, TAG_VALUES } from '../tags.js';

/** Serialize an audit log entry to a deterministic JSON buffer. */
export function serializeEntry(entry: AuditLogEntry): Buffer {
  const ordered = {
    id: entry.id,
    timestamp: entry.timestamp,
    agentId: entry.agentId,
    sessionId: entry.sessionId ?? null,
    eventType: entry.eventType,
    action: entry.action,
    input: entry.input ?? null,
    output: entry.output ?? null,
    metadata: entry.metadata ?? null,
    parentEventId: entry.parentEventId ?? null,
  };
  return Buffer.from(JSON.stringify(ordered), 'utf-8');
}

/**
 * Flush a batch of audit log entries by anchoring them as a Merkle tree
 * on Arweave via the SDK's batchAnchor().
 */
export async function executeFlushBatch(
  sdk: AgenticWay,
  entries: AuditLogEntry[]
): Promise<FlushResult> {
  if (entries.length === 0) {
    throw new Error('Cannot flush an empty batch');
  }

  // Collect unique event types and agent IDs for tags
  const eventTypes = [...new Set(entries.map((e) => e.eventType))];
  const agentIds = [...new Set(entries.map((e) => e.agentId))];
  const sessionIds = [...new Set(entries.map((e) => e.sessionId).filter(Boolean))] as string[];

  const timestamps = entries.map((e) => e.timestamp).sort();

  const metadata: Record<string, string> = {
    [TAG_NAMES.TYPE]: TAG_VALUES.TYPE_AUDIT_BATCH,
    [TAG_NAMES.CONTENT_TYPE]: TAG_VALUES.CONTENT_TYPE,
    [TAG_NAMES.AGENT_ID]: agentIds.join(','),
    [TAG_NAMES.EVENT_TYPES]: eventTypes.join(','),
    [TAG_NAMES.ENTRY_COUNT]: String(entries.length),
    [TAG_NAMES.BATCH_START]: timestamps[0],
    [TAG_NAMES.BATCH_END]: timestamps[timestamps.length - 1],
  };

  if (sessionIds.length > 0) {
    metadata[TAG_NAMES.SESSION_ID] = sessionIds.join(',');
  }

  // Serialize entries to buffers for anchoring
  const items = entries.map((entry) => ({
    data: serializeEntry(entry),
  }));

  const result = await sdk.batchAnchor({ items, metadata });

  // Build proof map keyed by entry ID
  const proofs = new Map<string, EntryProof>();
  for (let i = 0; i < entries.length; i++) {
    const p = result.proofs[i];
    proofs.set(entries[i].id, {
      entryId: entries[i].id,
      index: p.index,
      hash: p.hash,
      proof: p.proof,
    });
  }

  return {
    txId: result.txId,
    merkleRoot: result.merkleRoot,
    entryCount: entries.length,
    proofs,
    timestamp: result.timestamp,
  };
}
