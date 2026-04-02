import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAgenticWayTools,
  createStoreTool,
  createRetrieveTool,
  createVerifyTool,
  createSearchTool,
  createQueryTool,
  createResolveTool,
} from '../src/index.js';

function createMockClient() {
  return {
    store: vi.fn(),
    retrieve: vi.fn(),
    verify: vi.fn(),
    search: vi.fn(),
    query: vi.fn(),
    resolve: vi.fn(),
    info: vi.fn(),
    gateway: {} as any,
    signer: null,
    manifests: null,
    verifier: {} as any,
  };
}

describe('createAgenticWayTools', () => {
  it('returns an array of six tools', () => {
    const client = createMockClient();
    const tools = createAgenticWayTools(client as any);

    expect(tools).toHaveLength(6);
    const names = tools.map((t) => t.name);
    expect(names).toContain('arweave_store');
    expect(names).toContain('arweave_retrieve');
    expect(names).toContain('arweave_verify');
    expect(names).toContain('arweave_search');
    expect(names).toContain('arweave_query');
    expect(names).toContain('arweave_resolve');
  });
});

describe('store tool', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('calls client.store with Buffer data and returns JSON string', async () => {
    client.store.mockResolvedValue({
      txId: 'abc123',
      viewUrl: 'https://ario.agenticway.io/abc123',
    });

    const tool = createStoreTool(client as any);
    const result = await tool.invoke({
      data: 'hello world',
      contentType: 'text/plain',
      tags: { app: 'test' },
    });

    expect(client.store).toHaveBeenCalledOnce();
    const call = client.store.mock.calls[0][0];
    expect(Buffer.from(call.data).toString('utf-8')).toBe('hello world');
    expect(call.contentType).toBe('text/plain');

    const parsed = JSON.parse(result);
    expect(parsed.txId).toBe('abc123');
    expect(parsed.viewUrl).toBe('https://ario.agenticway.io/abc123');
    expect(parsed.provenance).toBeNull();
  });

  it('includes provenance when returned', async () => {
    client.store.mockResolvedValue({
      txId: 'abc123',
      viewUrl: 'https://ario.agenticway.io/abc123',
      provenance: { manifestId: 'urn:c2pa:123', assetHash: 'hash123' },
    });

    const tool = createStoreTool(client as any);
    const result = JSON.parse(await tool.invoke({ data: 'test' }));

    expect(result.provenance).toEqual({ manifestId: 'urn:c2pa:123', assetHash: 'hash123' });
  });
});

describe('retrieve tool', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('calls client.retrieve and returns JSON string', async () => {
    client.retrieve.mockResolvedValue({
      data: Buffer.from('hello world'),
      contentType: 'text/plain',
      tags: [{ name: 'Content-Type', value: 'text/plain' }],
    });

    const tool = createRetrieveTool(client as any);
    const result = JSON.parse(await tool.invoke({ id: 'abc123' }));

    expect(client.retrieve).toHaveBeenCalledWith('abc123');
    expect(result.data).toBe('hello world');
    expect(result.contentType).toBe('text/plain');
  });
});

describe('verify tool', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('calls client.verify and returns JSON string', async () => {
    client.verify.mockResolvedValue({
      verificationId: 'v1',
      valid: true,
      tier: 'full',
      existence: {
        status: 'confirmed',
        blockHeight: 1000,
        blockTimestamp: '2024-01-01',
        confirmations: 50,
      },
      integrity: { status: 'verified', hash: 'abc', match: true },
      metadata: { dataSize: 100, contentType: 'text/plain', tags: [] },
      links: { dashboard: 'https://example.com', pdf: null },
    });

    const tool = createVerifyTool(client as any);
    const result = JSON.parse(await tool.invoke({ txId: 'abc123' }));

    expect(client.verify).toHaveBeenCalledWith('abc123');
    expect(result.valid).toBe(true);
    expect(result.existence.status).toBe('confirmed');
  });
});

describe('search tool', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('calls client.search with phash', async () => {
    client.search.mockResolvedValue({ results: [], total: 0 });

    const tool = createSearchTool(client as any);
    const result = JSON.parse(await tool.invoke({ phash: 'abcdef0123456789', threshold: 5 }));

    expect(client.search).toHaveBeenCalledWith({
      image: undefined,
      phash: 'abcdef0123456789',
      threshold: 5,
      limit: undefined,
    });
    expect(result.total).toBe(0);
  });

  it('decodes base64 image for search', async () => {
    client.search.mockResolvedValue({ results: [], total: 0 });

    const tool = createSearchTool(client as any);
    await tool.invoke({ imageBase64: 'aGVsbG8=' });

    const call = client.search.mock.calls[0][0];
    expect(Buffer.from(call.image).toString('utf-8')).toBe('hello');
  });
});

describe('query tool', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('calls client.query with filters', async () => {
    client.query.mockResolvedValue({
      edges: [{ txId: 'tx1', owner: 'addr1', tags: [], block: null, dataSize: 50 }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    const tool = createQueryTool(client as any);
    const result = JSON.parse(
      await tool.invoke({
        tags: [{ name: 'App-Name', values: ['MyApp'] }],
        first: 10,
        sort: 'HEIGHT_DESC',
      })
    );

    expect(client.query).toHaveBeenCalledOnce();
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].txId).toBe('tx1');
  });
});

describe('resolve tool', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('calls client.resolve and returns JSON string', async () => {
    client.resolve.mockResolvedValue({
      txId: 'resolved-tx',
      ttl: 3600,
      owner: 'owner-addr',
    });

    const tool = createResolveTool(client as any);
    const result = JSON.parse(await tool.invoke({ name: 'my-app' }));

    expect(client.resolve).toHaveBeenCalledWith('my-app');
    expect(result.txId).toBe('resolved-tx');
    expect(result.ttl).toBe(3600);
  });
});
