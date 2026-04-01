import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { AgenticWay } from '@agenticway/sdk';

/**
 * Create a LangChain tool that permanently stores data on Arweave.
 */
export function createStoreTool(client: AgenticWay) {
  return new DynamicStructuredTool({
    name: 'arweave_store',
    description:
      'Store data permanently on Arweave. Returns a transaction ID and view URL. ' +
      'Use this to persist text, JSON, or other string data to the permaweb.',
    schema: z.object({
      data: z.string().describe('The data to store (text, JSON string, etc.)'),
      contentType: z
        .string()
        .optional()
        .describe(
          'MIME content type (e.g. "text/plain", "application/json"). Auto-detected if omitted.'
        ),
      tags: z
        .record(z.string())
        .optional()
        .describe('Custom key-value tags to attach to the Arweave transaction'),
    }),
    func: async ({ data, contentType, tags }) => {
      const result = await client.store({
        data: Buffer.from(data, 'utf-8'),
        contentType,
        tags,
      });
      return JSON.stringify({
        txId: result.txId,
        viewUrl: result.viewUrl,
        provenance: result.provenance ?? null,
      });
    },
  });
}

/**
 * Create a LangChain tool that retrieves data from Arweave.
 */
export function createRetrieveTool(client: AgenticWay) {
  return new DynamicStructuredTool({
    name: 'arweave_retrieve',
    description:
      'Retrieve data from Arweave by transaction ID or ArNS name. ' +
      'Returns the data as a string along with content type and tags.',
    schema: z.object({
      id: z.string().describe('Arweave transaction ID or ArNS name to retrieve'),
    }),
    func: async ({ id }) => {
      const result = await client.retrieve(id);
      return JSON.stringify({
        data: result.data.toString('utf-8'),
        contentType: result.contentType,
        tags: result.tags,
      });
    },
  });
}

/**
 * Create a LangChain tool that verifies an Arweave transaction.
 */
export function createVerifyTool(client: AgenticWay) {
  return new DynamicStructuredTool({
    name: 'arweave_verify',
    description:
      'Verify the on-chain existence and data integrity of an Arweave transaction. ' +
      'Returns verification status, block confirmation details, and integrity checks.',
    schema: z.object({
      txId: z.string().describe('Arweave transaction ID to verify'),
    }),
    func: async ({ txId }) => {
      const result = await client.verify(txId);
      return JSON.stringify({
        valid: result.valid,
        tier: result.tier,
        existence: result.existence,
        integrity: result.integrity,
        metadata: result.metadata,
        links: result.links,
      });
    },
  });
}

/**
 * Create a LangChain tool for perceptual-hash similarity search.
 */
export function createSearchTool(client: AgenticWay) {
  return new DynamicStructuredTool({
    name: 'arweave_search',
    description:
      'Search for visually similar content on Arweave using perceptual hashing. ' +
      'Provide either a base64-encoded image or a precomputed perceptual hash. ' +
      'Requires the trusthash sidecar to be configured.',
    schema: z.object({
      imageBase64: z
        .string()
        .optional()
        .describe('Base64-encoded image data to search for similar content'),
      phash: z
        .string()
        .optional()
        .describe('Pre-computed perceptual hash (16-char hex) to search for'),
      threshold: z
        .number()
        .int()
        .min(0)
        .max(64)
        .optional()
        .describe('Hamming distance threshold (0-64, default: 10). Lower = more similar.'),
      limit: z.number().int().min(1).optional().describe('Max results to return (default: 10)'),
    }),
    func: async ({ imageBase64, phash, threshold, limit }) => {
      const result = await client.search({
        image: imageBase64 ? Buffer.from(imageBase64, 'base64') : undefined,
        phash,
        threshold,
        limit,
      });
      return JSON.stringify({ results: result.results, total: result.total });
    },
  });
}

/**
 * Create a LangChain tool for querying Arweave transactions.
 */
export function createQueryTool(client: AgenticWay) {
  return new DynamicStructuredTool({
    name: 'arweave_query',
    description:
      'Query Arweave transactions using tag filters, owner addresses, and block ranges. ' +
      'Supports pagination via cursors. Returns matching transaction metadata.',
    schema: z.object({
      tags: z
        .array(
          z.object({
            name: z.string().describe('Tag name to match'),
            values: z.array(z.string()).describe('Tag values to match (any of)'),
          })
        )
        .optional()
        .describe('Filter by transaction tags'),
      owners: z.array(z.string()).optional().describe('Filter by owner wallet addresses'),
      first: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max results to return (default: 25, max: 100)'),
      after: z.string().optional().describe('Cursor for pagination'),
      sort: z
        .enum(['HEIGHT_DESC', 'HEIGHT_ASC'])
        .optional()
        .describe('Sort order (default: HEIGHT_DESC)'),
      minBlock: z.number().int().optional().describe('Minimum block height filter'),
      maxBlock: z.number().int().optional().describe('Maximum block height filter'),
    }),
    func: async ({ tags, owners, first, after, sort, minBlock, maxBlock }) => {
      const result = await client.query({ tags, owners, first, after, sort, minBlock, maxBlock });
      return JSON.stringify({ edges: result.edges, pageInfo: result.pageInfo });
    },
  });
}

/**
 * Create a LangChain tool that resolves ArNS names.
 */
export function createResolveTool(client: AgenticWay) {
  return new DynamicStructuredTool({
    name: 'arweave_resolve',
    description:
      'Resolve an ArNS (Arweave Name System) name to its underlying Arweave transaction ID. ' +
      'Returns the transaction ID, TTL, and owner of the name.',
    schema: z.object({
      name: z.string().describe('ArNS name to resolve (e.g. "my-app")'),
    }),
    func: async ({ name }) => {
      const result = await client.resolve(name);
      return JSON.stringify({ txId: result.txId, ttl: result.ttl, owner: result.owner });
    },
  });
}
