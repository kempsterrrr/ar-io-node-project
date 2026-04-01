import type { Tag } from '@ar-io/c2pa-protocol';
import type { GatewayInfo } from '../types.js';

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

  /** GET /raw/:txId — fetch transaction tags via GraphQL. */
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
