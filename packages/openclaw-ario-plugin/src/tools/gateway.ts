/**
 * OpenClaw Gateway Tools — powered by @agenticway/sdk
 *
 * Replaces raw HTTP calls with typed SDK methods for
 * gateway info, data retrieval, ArNS resolution, and transaction queries.
 */

import type { AgenticWay } from '@agenticway/sdk';
import type { OpenClawPluginApi, ToolResult } from '../types.js';
import { toolResult, toolError } from '../types.js';

export function registerGatewayTools(api: OpenClawPluginApi, sdk: AgenticWay): void {
  // Tool: gateway_info
  api.registerTool({
    name: 'gateway_info',
    description:
      'Get information about the AR.IO gateway including network, version, and status. Use this to check connectivity and gateway capabilities.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      try {
        const info = await sdk.info();
        return toolResult({ success: true, data: info });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_fetch — uses sdk.retrieve()
  api.registerTool({
    name: 'gateway_fetch',
    description:
      'Fetch a transaction from Arweave by its transaction ID. Returns the transaction metadata including tags, content type, and optionally the data content.',
    parameters: {
      type: 'object',
      properties: {
        txId: {
          type: 'string',
          description: 'The Arweave transaction ID (43 character base64url)',
        },
        includeData: {
          type: 'boolean',
          description: 'Whether to include the raw data content as base64. Default is false.',
        },
      },
      required: ['txId'],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const txId = params.txId as string;
        const includeData = (params.includeData as boolean) ?? false;

        const result = await sdk.retrieve(txId);

        const response: Record<string, unknown> = {
          id: txId,
          contentType: result.contentType,
          tags: result.tags,
          dataSize: result.data.length,
        };

        if (includeData) {
          response.data = result.data.toString('base64');
        }

        return toolResult({ success: true, data: response });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_resolve — uses sdk.resolve()
  api.registerTool({
    name: 'gateway_resolve',
    description:
      "Resolve an ArNS (Arweave Name System) name to its transaction ID. ArNS names are human-readable names like 'permacast' or 'ardrive' that point to Arweave content.",
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: "The ArNS name to resolve (e.g., 'permacast', 'ardrive')",
        },
      },
      required: ['name'],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const name = params.name as string;
        const resolution = await sdk.resolve(name);
        return toolResult({
          success: true,
          data: {
            name,
            txId: resolution.txId,
            ttl: resolution.ttl,
            owner: resolution.owner,
          },
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_search — uses sdk.query() (GraphQL)
  api.registerTool({
    name: 'gateway_search',
    description:
      'Search for Arweave transactions by tags or owner addresses. Useful for finding content by type (Content-Type tag), application (App-Name tag), or by wallet address.',
    parameters: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          description:
            'Array of tag filters. Each filter has a name and array of possible values. Example: [{"name": "Content-Type", "values": ["image/png"]}]',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              values: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        owners: {
          type: 'array',
          description: 'Array of wallet addresses to filter by.',
          items: { type: 'string' },
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return. Default is 10.',
        },
      },
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const tags = params.tags as { name: string; values: string[] }[] | undefined;
        const owners = params.owners as string[] | undefined;
        const limit = (params.limit as number) ?? 10;

        const result = await sdk.query({ tags, owners, first: limit });

        const transactions = result.edges.map((edge) => ({
          id: edge.txId,
          owner: edge.owner,
          tags: edge.tags,
          dataSize: edge.dataSize,
          block: edge.block,
        }));

        return toolResult({
          success: true,
          data: {
            count: transactions.length,
            transactions,
            hasMore: result.pageInfo.hasNextPage,
          },
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
