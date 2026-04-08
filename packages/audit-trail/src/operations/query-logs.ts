import type { AgenticWay, TagFilter } from '@agenticway/sdk';
import type { QueryLogsOptions, QueryLogsResult, AuditLogEdge } from '../types.js';
import { TAG_NAMES, TAG_VALUES } from '../tags.js';

/**
 * Query anchored audit log batches from Arweave using tag filters.
 */
export async function executeQueryLogs(
  sdk: AgenticWay,
  options?: QueryLogsOptions
): Promise<QueryLogsResult> {
  // Always filter for audit trail batches
  const tags: TagFilter[] = [
    { name: TAG_NAMES.PROTOCOL, values: [TAG_VALUES.PROTOCOL] },
    { name: TAG_NAMES.TYPE, values: [TAG_VALUES.TYPE_AUDIT_BATCH] },
  ];

  if (options?.agentId) {
    tags.push({ name: TAG_NAMES.AGENT_ID, values: [options.agentId] });
  }

  if (options?.sessionId) {
    tags.push({ name: TAG_NAMES.SESSION_ID, values: [options.sessionId] });
  }

  if (options?.eventTypes && options.eventTypes.length > 0) {
    tags.push({ name: TAG_NAMES.EVENT_TYPES, values: options.eventTypes });
  }

  const result = await sdk.query({
    tags,
    first: options?.first,
    after: options?.after,
    sort: options?.sort,
    minBlock: options?.minBlock,
    maxBlock: options?.maxBlock,
  });

  const edges: AuditLogEdge[] = result.edges.map((edge) => {
    const findTag = (name: string) => edge.tags.find((t) => t.name === name)?.value ?? null;

    return {
      txId: edge.txId,
      agentId: findTag(TAG_NAMES.AGENT_ID),
      sessionId: findTag(TAG_NAMES.SESSION_ID),
      eventTypes: findTag(TAG_NAMES.EVENT_TYPES),
      entryCount: findTag(TAG_NAMES.ENTRY_COUNT),
      block: edge.block,
    };
  });

  return {
    edges,
    pageInfo: result.pageInfo,
  };
}
