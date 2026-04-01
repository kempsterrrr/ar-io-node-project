import type { Tag } from '@ar-io/c2pa-protocol';
import type { GatewayInfo, QueryEdge, PageInfo } from '../types.js';

/** Typed HTTP client for the AR.IO gateway. */
export class GatewayClient {
  constructor(
    private baseUrl: string,
    private timeoutMs: number
  ) {}

  /** GET /ar-io/info — gateway metadata. */
  async info(): Promise<GatewayInfo> {
    const res = await this.fetch('/ar-io/info');
    return res.json() as Promise<GatewayInfo>;
  }

  /** GET /:txId — fetch raw transaction data. Returns data + content-type. */
  async fetchTransaction(txId: string): Promise<{ data: Buffer; contentType: string }> {
    const res = await this.fetch(`/${txId}`);
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const arrayBuffer = await res.arrayBuffer();
    return { data: Buffer.from(arrayBuffer), contentType };
  }

  /** Fetch transaction tags via GraphQL. */
  async fetchTransactionTags(txId: string): Promise<Tag[]> {
    const query = `{
      transaction(id: "${txId}") {
        tags { name value }
      }
    }`;
    const res = await this.fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const json = (await res.json()) as {
      data?: { transaction?: { tags?: Tag[] } };
    };
    return json.data?.transaction?.tags ?? [];
  }

  /** Query transactions via GraphQL with filters. */
  async queryGraphQL(options: {
    tags?: Array<{ name: string; values: string[] }>;
    owners?: string[];
    first?: number;
    after?: string;
    sort?: 'HEIGHT_DESC' | 'HEIGHT_ASC';
    minBlock?: number;
    maxBlock?: number;
  }): Promise<{ edges: QueryEdge[]; pageInfo: PageInfo }> {
    const first = Math.min(options.first ?? 25, 100);
    const sort = options.sort ?? 'HEIGHT_DESC';

    // Build query variables
    const tagFilters = options.tags
      ? options.tags.map((t) => `{ name: "${t.name}", values: ${JSON.stringify(t.values)} }`)
      : [];

    const ownerFilter = options.owners?.length ? `owners: ${JSON.stringify(options.owners)}` : '';

    const afterFilter = options.after ? `after: "${options.after}"` : '';

    const blockFilter =
      options.minBlock !== undefined || options.maxBlock !== undefined
        ? `block: { min: ${options.minBlock ?? 0}${options.maxBlock !== undefined ? `, max: ${options.maxBlock}` : ''} }`
        : '';

    const tagFilterStr = tagFilters.length ? `tags: [${tagFilters.join(', ')}]` : '';

    const filters = [
      `first: ${first}`,
      `sort: ${sort}`,
      tagFilterStr,
      ownerFilter,
      afterFilter,
      blockFilter,
    ]
      .filter(Boolean)
      .join(', ');

    const query = `{
      transactions(${filters}) {
        edges {
          cursor
          node {
            id
            owner { address }
            tags { name value }
            block { height timestamp }
            data { size }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }`;

    const res = await this.fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const json = (await res.json()) as {
      data?: {
        transactions?: {
          edges?: Array<{
            cursor: string;
            node: {
              id: string;
              owner: { address: string };
              tags: Tag[];
              block: { height: number; timestamp: number } | null;
              data: { size: string };
            };
          }>;
          pageInfo?: { hasNextPage: boolean };
        };
      };
    };

    const rawEdges = json.data?.transactions?.edges ?? [];
    const edges: QueryEdge[] = rawEdges.map((e) => ({
      txId: e.node.id,
      owner: e.node.owner.address,
      tags: e.node.tags,
      block: e.node.block,
      dataSize: parseInt(e.node.data.size, 10) || 0,
    }));

    const lastCursor = rawEdges.length > 0 ? rawEdges[rawEdges.length - 1].cursor : null;
    const hasNextPage = json.data?.transactions?.pageInfo?.hasNextPage ?? false;

    return {
      edges,
      pageInfo: { hasNextPage, endCursor: lastCursor },
    };
  }

  /** Resolve an ArNS name to a transaction ID via the gateway. */
  async resolveArNS(name: string): Promise<{ txId: string }> {
    // AR.IO gateways serve ArNS data at subdomain or path. Try the /ar-io/resolver endpoint.
    // If the name includes dots, it's a full domain — strip to get the ArNS label.
    const label = name.replace(/\.ar-io\.dev$/, '').replace(/\.arweave\.net$/, '');
    const res = await this.fetch(`/ar-io/resolver/${label}`);
    const json = (await res.json()) as {
      txId?: string;
      ttl?: number;
      owner?: string;
    };
    if (!json.txId) {
      throw new Error(`ArNS name "${name}" could not be resolved`);
    }
    return { txId: json.txId };
  }

  /** GET /ar-io/healthcheck — gateway health. */
  async healthcheck(): Promise<boolean> {
    try {
      const res = await this.fetch('/ar-io/healthcheck');
      return res.ok;
    } catch {
      return false;
    }
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Gateway ${path}: HTTP ${res.status}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
