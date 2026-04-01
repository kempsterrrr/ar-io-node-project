import type { QueryOptions, QueryResult } from '../types.js';
import { GatewayClient } from '../clients/gateway.js';

export async function executeQuery(
  gateway: GatewayClient,
  options: QueryOptions
): Promise<QueryResult> {
  return gateway.queryGraphQL({
    tags: options.tags,
    owners: options.owners,
    first: options.first,
    after: options.after,
    sort: options.sort,
    minBlock: options.minBlock,
    maxBlock: options.maxBlock,
  });
}
