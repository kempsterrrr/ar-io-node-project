import type { AgenticWay } from '@agenticway/sdk';
import type { QueryProvenanceOptions, QueryProvenanceResult, ProvenanceRecord } from '../types.js';
import { getTagValue } from '../tags.js';

/** C2PA protocol tag name used to identify C2PA content on Arweave. */
const C2PA_PROTOCOL_TAG = 'Protocol';
const C2PA_PROTOCOL_VALUE = 'C2PA-Manifest-Proof';

/**
 * Query provenance records from Arweave.
 *
 * Searches for C2PA-tagged transactions using the standard protocol tags.
 * Supports filtering by manifest ID, content type, and owner address.
 */
export async function executeQueryProvenance(
  sdk: AgenticWay,
  options: QueryProvenanceOptions
): Promise<QueryProvenanceResult> {
  const tags: Array<{ name: string; values: string[] }> = [
    { name: C2PA_PROTOCOL_TAG, values: [C2PA_PROTOCOL_VALUE] },
  ];

  if (options.manifestId) {
    tags.push({ name: 'C2PA-Manifest-ID', values: [options.manifestId] });
  }

  if (options.contentType) {
    tags.push({ name: 'Content-Type', values: [options.contentType] });
  }

  const result = await sdk.query({
    tags,
    owners: options.owner ? [options.owner] : undefined,
    first: options.first,
    after: options.after,
    sort: options.sort,
  });

  const records: ProvenanceRecord[] = result.edges.map((edge) => ({
    txId: edge.txId,
    owner: edge.owner,
    manifestId: getTagValue(edge.tags, 'C2PA-Manifest-ID'),
    contentType: getTagValue(edge.tags, 'Content-Type'),
    storageMode: getTagValue(edge.tags, 'C2PA-Storage-Mode'),
    assetHash: getTagValue(edge.tags, 'C2PA-Asset-Hash'),
    block: edge.block,
    dataSize: edge.dataSize,
  }));

  return {
    records,
    pageInfo: result.pageInfo,
  };
}
