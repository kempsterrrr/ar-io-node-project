/**
 * AR.IO Gateway HTTP Client
 *
 * Provides access to the AR.IO gateway for:
 * - Fetching transaction data from Arweave
 * - Resolving ArNS names
 * - Getting gateway status and info
 */

import type { ArNSResolution, ArweaveTransaction, GatewayInfo } from '../types/index.js';

export interface GatewayClientOptions {
  baseUrl: string;
  timeout?: number;
}

export class GatewayClient {
  private baseUrl: string;
  private timeout: number;

  constructor(options: GatewayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = options.timeout ?? 30000;
  }

  /**
   * Get gateway info and status
   */
  async getInfo(): Promise<GatewayInfo> {
    const response = await this.fetch('/ar-io/info');
    return response as GatewayInfo;
  }

  /**
   * Check if gateway is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/ar-io/info`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch a transaction by ID
   */
  async getTransaction(txId: string): Promise<ArweaveTransaction> {
    // Get transaction metadata
    const txResponse = await this.fetch(`/tx/${txId}`);

    // Get tags
    const tagsResponse = await this.fetch(`/tx/${txId}/tags`);

    return {
      id: txId,
      owner: (txResponse as { owner: string }).owner,
      tags: tagsResponse as { name: string; value: string }[],
      dataSize: (txResponse as { data_size?: string }).data_size
        ? parseInt((txResponse as { data_size: string }).data_size)
        : undefined,
    };
  }

  /**
   * Fetch transaction data
   */
  async getTransactionData(txId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/${txId}`, {
      method: 'GET',
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch transaction data: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Resolve an ArNS name to a transaction ID
   */
  async resolveArNS(name: string): Promise<ArNSResolution> {
    const response = await this.fetch(`/ar-io/resolver/records/${name}`);
    const data = response as { txId: string; ttlSeconds: number };

    return {
      name,
      txId: data.txId,
      ttlSeconds: data.ttlSeconds,
    };
  }

  /**
   * Search for transactions using GraphQL
   */
  async searchTransactions(query: {
    tags?: { name: string; values: string[] }[];
    owners?: string[];
    first?: number;
  }): Promise<ArweaveTransaction[]> {
    const graphqlQuery = this.buildSearchQuery(query);

    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: graphqlQuery }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`GraphQL query failed: ${response.statusText}`);
    }

    const result = (await response.json()) as {
      data?: {
        transactions?: {
          edges?: Array<{
            node: {
              id: string;
              owner: { address: string };
              tags: Array<{ name: string; value: string }>;
              data?: { size?: string };
            };
          }>;
        };
      };
    };

    const edges = result.data?.transactions?.edges ?? [];

    return edges.map((edge) => ({
      id: edge.node.id,
      owner: edge.node.owner.address,
      tags: edge.node.tags,
      dataSize: edge.node.data?.size ? parseInt(edge.node.data.size) : undefined,
    }));
  }

  private buildSearchQuery(query: {
    tags?: { name: string; values: string[] }[];
    owners?: string[];
    first?: number;
  }): string {
    const parts: string[] = [];

    if (query.tags && query.tags.length > 0) {
      const tagFilters = query.tags
        .map((t) => `{ name: "${t.name}", values: ${JSON.stringify(t.values)} }`)
        .join(', ');
      parts.push(`tags: [${tagFilters}]`);
    }

    if (query.owners && query.owners.length > 0) {
      parts.push(`owners: ${JSON.stringify(query.owners)}`);
    }

    const first = query.first ?? 10;
    parts.push(`first: ${first}`);

    return `
      query {
        transactions(${parts.join(', ')}) {
          edges {
            node {
              id
              owner { address }
              tags { name value }
              data { size }
            }
          }
        }
      }
    `;
  }

  private async fetch(path: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Gateway request failed: ${response.statusText}`);
    }

    return response.json();
  }
}
