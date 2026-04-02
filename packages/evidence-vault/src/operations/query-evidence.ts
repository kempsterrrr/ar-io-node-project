import type { AgenticWay, TagFilter } from '@agenticway/sdk';
import type { QueryEvidenceOptions, QueryEvidenceResult, EvidenceQueryEdge } from '../types.js';
import { TAG_NAMES, TAG_VALUES } from '../tags.js';

/**
 * Query evidence proofs on Arweave by domain, control, type, and date range.
 *
 * Translates AIUC-1 filter criteria into Arweave GraphQL tag queries
 * against the AgenticWay-Integrity protocol.
 */
export async function executeQueryEvidence(
  sdk: AgenticWay,
  options: QueryEvidenceOptions
): Promise<QueryEvidenceResult> {
  const tags: TagFilter[] = [
    { name: TAG_NAMES.PROTOCOL, values: [TAG_VALUES.PROTOCOL] },
    {
      name: TAG_NAMES.TYPE,
      values: [TAG_VALUES.TYPE_EVIDENCE, TAG_VALUES.TYPE_EVIDENCE_BATCH],
    },
  ];

  if (options.domain) {
    // Match both single-anchor (AIUC1-Domain) and batch (AIUC1-Domains contains value)
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

  // For domain/control filters, batch anchors use comma-separated tags.
  // Query single anchors first, then batch anchors separately and merge.
  const singleResult = await sdk.query({
    tags,
    first: options.first,
    after: options.after,
    sort: options.sort,
    minBlock: options.minBlock,
    maxBlock: options.maxBlock,
  });

  // If filtering by domain or control, also query batch anchors with batch-specific tags
  let batchEdges: typeof singleResult.edges = [];
  if (options.domain || options.controlId) {
    const batchTags: TagFilter[] = [
      { name: TAG_NAMES.PROTOCOL, values: [TAG_VALUES.PROTOCOL] },
      { name: TAG_NAMES.TYPE, values: [TAG_VALUES.TYPE_EVIDENCE_BATCH] },
    ];
    if (options.organizationId) {
      batchTags.push({ name: TAG_NAMES.ORGANIZATION_ID, values: [options.organizationId] });
    }
    // Batch anchors store domains/controls as comma-separated values in different tag names.
    // Arweave GraphQL matches substring within tag values, so this finds batches containing
    // the requested domain/control.
    if (options.domain) {
      batchTags.push({ name: 'AIUC1-Domains', values: [options.domain] });
    }
    if (options.controlId) {
      batchTags.push({ name: 'AIUC1-Control-Ids', values: [options.controlId] });
    }

    const batchResult = await sdk.query({
      tags: batchTags,
      first: options.first,
      sort: options.sort,
      minBlock: options.minBlock,
      maxBlock: options.maxBlock,
    });
    batchEdges = batchResult.edges;
  }

  // Merge and deduplicate by txId
  const seenTxIds = new Set(singleResult.edges.map((e) => e.txId));
  const mergedEdges = [...singleResult.edges];
  for (const edge of batchEdges) {
    if (!seenTxIds.has(edge.txId)) {
      mergedEdges.push(edge);
      seenTxIds.add(edge.txId);
    }
  }

  const edges: EvidenceQueryEdge[] = mergedEdges.map((edge) => {
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
    pageInfo: singleResult.pageInfo,
  };
}
