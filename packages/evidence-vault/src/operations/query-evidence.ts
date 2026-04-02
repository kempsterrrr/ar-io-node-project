import type { AgenticWay, TagFilter } from '@agenticway/sdk';
import type { QueryEvidenceOptions, QueryEvidenceResult, EvidenceQueryEdge } from '../types.js';
import { TAG_NAMES, TAG_VALUES } from '../tags.js';

/**
 * Query evidence proofs on Arweave by domain, control, type, and date range.
 *
 * Translates AIUC-1 filter criteria into Arweave GraphQL tag queries
 * against the AgenticWay-Integrity protocol.
 *
 * When no domain/control/type filter is set, returns both single and batch
 * anchors. When filters are set, returns only single anchors (batch anchors
 * use aggregate tags that don't support per-item filtering via GraphQL).
 * Use batch Merkle proofs to verify individual items within a batch.
 */
export async function executeQueryEvidence(
  sdk: AgenticWay,
  options: QueryEvidenceOptions
): Promise<QueryEvidenceResult> {
  const hasItemFilter = !!(options.domain || options.controlId || options.evidenceType);

  const tags: TagFilter[] = [{ name: TAG_NAMES.PROTOCOL, values: [TAG_VALUES.PROTOCOL] }];

  // When filtering by domain/control/type, target single anchors only.
  // Batch anchors store aggregate metadata (comma-separated domains/controls)
  // and Arweave GraphQL uses exact tag matching, so per-item filters
  // cannot reliably match batch transactions.
  if (hasItemFilter) {
    tags.push({ name: TAG_NAMES.TYPE, values: [TAG_VALUES.TYPE_EVIDENCE] });
  } else {
    tags.push({
      name: TAG_NAMES.TYPE,
      values: [TAG_VALUES.TYPE_EVIDENCE, TAG_VALUES.TYPE_EVIDENCE_BATCH],
    });
  }

  if (options.domain) {
    tags.push({ name: TAG_NAMES.AIUC1_DOMAIN, values: [options.domain] });
  }
  if (options.controlId) {
    tags.push({ name: TAG_NAMES.AIUC1_CONTROL_ID, values: [options.controlId] });
  }
  if (options.evidenceType) {
    tags.push({ name: TAG_NAMES.EVIDENCE_TYPE, values: [options.evidenceType] });
  }
  if (options.organizationId) {
    tags.push({ name: TAG_NAMES.ORGANIZATION_ID, values: [options.organizationId] });
  }

  const result = await sdk.query({
    tags,
    first: options.first,
    after: options.after,
    sort: options.sort,
    minBlock: options.minBlock,
    maxBlock: options.maxBlock,
  });

  const edges: EvidenceQueryEdge[] = result.edges.map((edge) => {
    const tagMap = new Map(edge.tags.map((t) => [t.name, t.value]));
    return {
      txId: edge.txId,
      owner: edge.owner,
      controlId: tagMap.get(TAG_NAMES.AIUC1_CONTROL_ID) ?? '',
      domain: tagMap.get(TAG_NAMES.AIUC1_DOMAIN) ?? '',
      evidenceType: tagMap.get(TAG_NAMES.EVIDENCE_TYPE) ?? '',
      label: tagMap.get(TAG_NAMES.EVIDENCE_LABEL) ?? null,
      organizationId: tagMap.get(TAG_NAMES.ORGANIZATION_ID) ?? null,
      block: edge.block,
      dataSize: edge.dataSize,
    };
  });

  return {
    edges,
    pageInfo: result.pageInfo,
  };
}
