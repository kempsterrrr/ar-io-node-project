import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerGatewayTools } from '../src/tools/gateway.js';
import { registerStorageTools } from '../src/tools/storage.js';
import type { OpenClawPluginApi, ToolResult } from '../src/types.js';

// Mock AgenticWay SDK
function createMockSdk() {
  return {
    info: vi.fn(),
    retrieve: vi.fn(),
    resolve: vi.fn(),
    query: vi.fn(),
    store: vi.fn(),
    verify: vi.fn(),
    anchor: vi.fn(),
    verifyAnchor: vi.fn(),
    search: vi.fn(),
    batchAnchor: vi.fn(),
    gateway: {},
    signer: null,
    manifests: null,
    verifier: {},
  } as any;
}

function createMockApi() {
  const tools: Map<string, (id: string, params: Record<string, unknown>) => Promise<ToolResult>> =
    new Map();

  const api: OpenClawPluginApi = {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    registerTool: vi.fn((tool) => {
      tools.set(tool.name, tool.execute);
    }),
  };

  return { api, tools };
}

function parseResult(result: ToolResult): any {
  return JSON.parse(result.content[0].text);
}

describe('Gateway Tools', () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let api: OpenClawPluginApi;
  let tools: Map<string, (id: string, params: Record<string, unknown>) => Promise<ToolResult>>;

  beforeEach(() => {
    sdk = createMockSdk();
    const mock = createMockApi();
    api = mock.api;
    tools = mock.tools;
    registerGatewayTools(api, sdk);
  });

  it('registers 4 gateway tools', () => {
    expect(api.registerTool).toHaveBeenCalledTimes(4);
    expect(tools.has('gateway_info')).toBe(true);
    expect(tools.has('gateway_fetch')).toBe(true);
    expect(tools.has('gateway_resolve')).toBe(true);
    expect(tools.has('gateway_search')).toBe(true);
  });

  describe('gateway_info', () => {
    it('returns gateway info via sdk.info()', async () => {
      sdk.info.mockResolvedValue({ processId: 'abc', release: '1.0.0' });

      const result = parseResult(await tools.get('gateway_info')!('id', {}));

      expect(result.success).toBe(true);
      expect(result.data.processId).toBe('abc');
      expect(sdk.info).toHaveBeenCalledOnce();
    });

    it('handles errors gracefully', async () => {
      sdk.info.mockRejectedValue(new Error('Connection refused'));

      const result = parseResult(await tools.get('gateway_info')!('id', {}));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('gateway_fetch', () => {
    it('retrieves transaction metadata via sdk.retrieve()', async () => {
      sdk.retrieve.mockResolvedValue({
        data: Buffer.from('hello'),
        contentType: 'text/plain',
        tags: [{ name: 'App-Name', value: 'AgenticWay' }],
      });

      const result = parseResult(await tools.get('gateway_fetch')!('id', { txId: 'abc123' }));

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('abc123');
      expect(result.data.contentType).toBe('text/plain');
      expect(result.data.dataSize).toBe(5);
      expect(result.data.data).toBeUndefined();
      expect(sdk.retrieve).toHaveBeenCalledWith('abc123');
    });

    it('includes base64 data when includeData=true', async () => {
      sdk.retrieve.mockResolvedValue({
        data: Buffer.from('hello'),
        contentType: 'text/plain',
        tags: [],
      });

      const result = parseResult(
        await tools.get('gateway_fetch')!('id', { txId: 'abc123', includeData: true })
      );

      expect(result.success).toBe(true);
      expect(result.data.data).toBe(Buffer.from('hello').toString('base64'));
    });
  });

  describe('gateway_resolve', () => {
    it('resolves ArNS names via sdk.resolve()', async () => {
      sdk.resolve.mockResolvedValue({
        txId: 'resolved-tx-123',
        ttl: 3600,
        owner: 'wallet-address',
      });

      const result = parseResult(await tools.get('gateway_resolve')!('id', { name: 'permacast' }));

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('permacast');
      expect(result.data.txId).toBe('resolved-tx-123');
      expect(sdk.resolve).toHaveBeenCalledWith('permacast');
    });
  });

  describe('gateway_search', () => {
    it('searches transactions via sdk.query()', async () => {
      sdk.query.mockResolvedValue({
        edges: [
          {
            txId: 'tx1',
            owner: 'owner1',
            tags: [{ name: 'Content-Type', value: 'image/png' }],
            dataSize: 1024,
            block: { height: 1000, timestamp: 1234567890 },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      });

      const result = parseResult(
        await tools.get('gateway_search')!('id', {
          tags: [{ name: 'Content-Type', values: ['image/png'] }],
          limit: 5,
        })
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.transactions[0].id).toBe('tx1');
      expect(sdk.query).toHaveBeenCalledWith({
        tags: [{ name: 'Content-Type', values: ['image/png'] }],
        owners: undefined,
        first: 5,
      });
    });
  });
});

describe('Storage & Integrity Tools', () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let api: OpenClawPluginApi;
  let tools: Map<string, (id: string, params: Record<string, unknown>) => Promise<ToolResult>>;

  beforeEach(() => {
    sdk = createMockSdk();
    const mock = createMockApi();
    api = mock.api;
    tools = mock.tools;
    registerStorageTools(api, sdk);
  });

  it('registers 4 storage tools', () => {
    expect(api.registerTool).toHaveBeenCalledTimes(4);
    expect(tools.has('arweave_store')).toBe(true);
    expect(tools.has('arweave_verify')).toBe(true);
    expect(tools.has('arweave_anchor')).toBe(true);
    expect(tools.has('arweave_verify_anchor')).toBe(true);
  });

  describe('arweave_store', () => {
    it('stores text data via sdk.store()', async () => {
      sdk.store.mockResolvedValue({
        txId: 'store-tx-123',
        viewUrl: 'https://arweave.net/store-tx-123',
        provenance: null,
      });

      const result = parseResult(
        await tools.get('arweave_store')!('id', {
          data: 'hello world',
          contentType: 'text/plain',
        })
      );

      expect(result.success).toBe(true);
      expect(result.data.txId).toBe('store-tx-123');
      expect(sdk.store).toHaveBeenCalledWith({
        data: Buffer.from('hello world', 'utf-8'),
        contentType: 'text/plain',
        tags: undefined,
      });
    });

    it('handles base64 binary data', async () => {
      const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      sdk.store.mockResolvedValue({
        txId: 'store-tx-456',
        viewUrl: 'https://arweave.net/store-tx-456',
      });

      const result = parseResult(
        await tools.get('arweave_store')!('id', {
          data: binary.toString('base64'),
          isBase64: true,
          contentType: 'image/png',
        })
      );

      expect(result.success).toBe(true);
      expect(sdk.store).toHaveBeenCalledWith({
        data: binary,
        contentType: 'image/png',
        tags: undefined,
      });
    });
  });

  describe('arweave_verify', () => {
    it('verifies transactions via sdk.verify()', async () => {
      sdk.verify.mockResolvedValue({
        verificationId: 'v-123',
        valid: true,
        tier: 'full',
        existence: {
          status: 'confirmed',
          blockHeight: 1234,
          blockTimestamp: '2026-01-01T00:00:00Z',
          confirmations: 100,
        },
        integrity: { status: 'verified', hash: 'abc', match: true },
        metadata: { dataSize: 100, contentType: 'text/plain', tags: [] },
        links: { dashboard: null, pdf: null },
      });

      const result = parseResult(await tools.get('arweave_verify')!('id', { txId: 'tx-123' }));

      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(true);
      expect(result.data.tier).toBe('full');
      expect(sdk.verify).toHaveBeenCalledWith('tx-123');
    });
  });

  describe('arweave_anchor', () => {
    it('anchors data hash via sdk.anchor()', async () => {
      sdk.anchor.mockResolvedValue({
        txId: 'anchor-tx-123',
        hash: 'sha256-hash-hex',
        timestamp: '2026-01-01T00:00:00Z',
      });

      const result = parseResult(
        await tools.get('arweave_anchor')!('id', {
          data: 'important document',
          metadata: { source: 'test' },
        })
      );

      expect(result.success).toBe(true);
      expect(result.data.txId).toBe('anchor-tx-123');
      expect(result.data.hash).toBe('sha256-hash-hex');
      expect(sdk.anchor).toHaveBeenCalledWith({
        data: Buffer.from('important document', 'utf-8'),
        metadata: { source: 'test' },
      });
    });
  });

  describe('arweave_verify_anchor', () => {
    it('verifies anchored data via sdk.verifyAnchor()', async () => {
      sdk.verifyAnchor.mockResolvedValue({
        valid: true,
        hash: 'hash-of-data',
        anchoredHash: 'hash-of-data',
        blockHeight: 5678,
        timestamp: '2026-01-01T00:00:00Z',
      });

      const result = parseResult(
        await tools.get('arweave_verify_anchor')!('id', {
          data: 'important document',
          txId: 'anchor-tx-123',
        })
      );

      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(true);
      expect(result.data.blockHeight).toBe(5678);
      expect(sdk.verifyAnchor).toHaveBeenCalledWith({
        data: Buffer.from('important document', 'utf-8'),
        txId: 'anchor-tx-123',
      });
    });

    it('reports invalid anchors', async () => {
      sdk.verifyAnchor.mockResolvedValue({
        valid: false,
        hash: 'hash-of-tampered-data',
        anchoredHash: 'original-hash',
        blockHeight: 5678,
        timestamp: '2026-01-01T00:00:00Z',
      });

      const result = parseResult(
        await tools.get('arweave_verify_anchor')!('id', {
          data: 'tampered document',
          txId: 'anchor-tx-123',
        })
      );

      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(false);
    });
  });
});
