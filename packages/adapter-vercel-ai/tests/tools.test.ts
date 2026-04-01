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

// Mock AgenticWay client
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
  it('returns all six tools', () => {
    const client = createMockClient();
    const tools = createAgenticWayTools(client as any);

    expect(tools).toHaveProperty('arweaveStore');
    expect(tools).toHaveProperty('arweaveRetrieve');
    expect(tools).toHaveProperty('arweaveVerify');
    expect(tools).toHaveProperty('arweaveSearch');
    expect(tools).toHaveProperty('arweaveQuery');
    expect(tools).toHaveProperty('arweaveResolve');
  });
});

describe('store tool', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('calls client.store with Buffer data and returns result', async () => {
    client.store.mockResolvedValue({
      txId: 'abc123',
      viewUrl: 'https://ario.agenticway.io/abc123',
    });

    const tool = createStoreTool(client as any);
    const result = await tool.execute(
      {
        data: 'hello world',
        contentType: 'text/plain',
        tags: { app: 'test' },
      },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any }
    );

    expect(client.store).toHaveBeenCalledOnce();
    const call = client.store.mock.calls[0][0];
    expect(Buffer.from(call.data).toString('utf-8')).toBe('hello world');
    expect(call.contentType).toBe('text/plain');
    expect(call.tags).toEqual({ app: 'test' });
    expect(result).toEqual({
      txId: 'abc123',
      viewUrl: 'https://ario.agenticway.io/abc123',
      provenance: null,
    });
  });

  it('includes provenance when returned', async () => {
    client.store.mockResolvedValue({
      txId: 'abc123',
      viewUrl: 'https://ario.agenticway.io/abc123',
      provenance: { manifestId: 'urn:c2pa:123', assetHash: 'hash123' },
    });

    const tool = createStoreTool(client as any);
    const result = await tool.execute(
      { data: 'test' },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any }
    );

    expect(result.provenance).toEqual({ manifestId: 'urn:c2pa:123', assetHash: 'hash123' });
  });
});

describe('retrieve tool', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('calls client.retrieve and returns string data', async () => {
    client.retrieve.mockResolvedValue({
      data: Buffer.from('hello world'),
      contentType: 'text/plain',
      tags: [{ name: 'Content-Type', value: 'text/plain' }],
    });

    const tool = createRetrieveTool(client as any);
    const result = await tool.execute(
      { id: 'abc123' },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any }
    );

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

  it('calls client.verify and returns verification result', async () => {
    const verifyResult = {
      verificationId: 'v1',
      valid: true,
      tier: 'full' as const,
      existence: {
        status: 'confirmed' as const,
        blockHeight: 1000,
        blockTimestamp: '2024-01-01',
        confirmations: 50,
      },
      integrity: { status: 'verified' as const, hash: 'abc', match: true },
      metadata: { dataSize: 100, contentType: 'text/plain', tags: [] },
      links: { dashboard: 'https://example.com', pdf: null },
    };
    client.verify.mockResolvedValue(verifyResult);

    const tool = createVerifyTool(client as any);
    const result = await tool.execute(
      { txId: 'abc123' },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any }
    );

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
    const result = await tool.execute(
      { phash: 'abcdef0123456789', threshold: 5 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any }
    );

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
    await tool.execute(
      { imageBase64: 'aGVsbG8=' },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any }
    );

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
    const result = await tool.execute(
      {
        tags: [{ name: 'App-Name', values: ['MyApp'] }],
        first: 10,
        sort: 'HEIGHT_DESC',
      },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any }
    );

    expect(client.query).toHaveBeenCalledWith({
      tags: [{ name: 'App-Name', values: ['MyApp'] }],
      owners: undefined,
      first: 10,
      after: undefined,
      sort: 'HEIGHT_DESC',
      minBlock: undefined,
      maxBlock: undefined,
    });
    expect(result.edges).toHaveLength(1);
  });
});

describe('resolve tool', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('calls client.resolve and returns result', async () => {
    client.resolve.mockResolvedValue({
      txId: 'resolved-tx',
      ttl: 3600,
      owner: 'owner-addr',
    });

    const tool = createResolveTool(client as any);
    const result = await tool.execute(
      { name: 'my-app' },
      { toolCallId: 'test', messages: [], abortSignal: undefined as any }
    );

    expect(client.resolve).toHaveBeenCalledWith('my-app');
    expect(result.txId).toBe('resolved-tx');
    expect(result.ttl).toBe(3600);
  });
});
