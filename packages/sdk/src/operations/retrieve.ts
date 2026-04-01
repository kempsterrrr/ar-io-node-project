import type { RetrieveResult } from '../types.js';
import { GatewayClient } from '../clients/gateway.js';

export async function executeRetrieve(gateway: GatewayClient, id: string): Promise<RetrieveResult> {
  // Fetch the transaction data
  const { data, contentType } = await gateway.fetchTransaction(id);

  // Fetch tags via GraphQL (best-effort — ArNS names won't have tags via this path)
  let tags: Array<{ name: string; value: string }> = [];
  try {
    // Only fetch tags if it looks like a transaction ID (43 chars, base64url)
    if (/^[\w-]{43}$/.test(id)) {
      tags = await gateway.fetchTransactionTags(id);
    }
  } catch {
    // Tags fetch is best-effort
  }

  return { data, contentType, tags };
}
