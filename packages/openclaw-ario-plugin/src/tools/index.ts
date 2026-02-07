/**
 * OpenClaw Tool Registration
 *
 * Registers AR.IO gateway tools with the OpenClaw plugin API.
 * See: https://docs.openclaw.ai/plugins/agent-tools
 */

import type { GatewayClient } from '../gateway/client.js';

/** OpenClaw tool content block */
interface ToolContent {
  type: 'text';
  text: string;
}

/** OpenClaw tool result format */
interface ToolResult {
  content: ToolContent[];
}

/** OpenClaw plugin API for tool registration */
interface OpenClawPluginApi {
  registerTool(tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (id: string, params: Record<string, unknown>) => Promise<ToolResult>;
  }): void;
}

/** Helper to format tool results for OpenClaw */
function toolResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/** Helper to format error results */
function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }) }],
  };
}

/**
 * Register all gateway tools with OpenClaw
 */
export function registerGatewayTools(api: OpenClawPluginApi, gateway: GatewayClient): void {
  // Tool: gateway_info
  api.registerTool({
    name: 'gateway_info',
    description:
      'Get information about the AR.IO gateway including network, version, and status. Use this to check connectivity and gateway capabilities.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_id) => {
      try {
        const info = await gateway.getInfo();
        return toolResult({ success: true, data: info });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_fetch
  api.registerTool({
    name: 'gateway_fetch',
    description:
      'Fetch a transaction from Arweave by its transaction ID. Returns the transaction metadata including tags, owner, and optionally the data content.',
    parameters: {
      type: 'object',
      properties: {
        txId: {
          type: 'string',
          description: 'The Arweave transaction ID (43 character base64url)',
        },
        includeData: {
          type: 'boolean',
          description: 'Whether to also fetch the transaction data content. Default is false.',
        },
      },
      required: ['txId'],
    },
    execute: async (_id, params) => {
      try {
        const txId = params.txId as string;
        const includeData = (params.includeData as boolean) ?? false;

        const tx = await gateway.getTransaction(txId);

        let data: string | undefined;
        if (includeData) {
          data = await gateway.getTransactionData(txId);
        }

        return toolResult({ success: true, data: { ...tx, data } });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_resolve
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
    execute: async (_id, params) => {
      try {
        const name = params.name as string;
        const resolution = await gateway.resolveArNS(name);
        return toolResult({ success: true, data: resolution });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_search
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
    execute: async (_id, params) => {
      try {
        const tags = params.tags as { name: string; values: string[] }[] | undefined;
        const owners = params.owners as string[] | undefined;
        const limit = (params.limit as number) ?? 10;

        const transactions = await gateway.searchTransactions({
          tags,
          owners,
          first: limit,
        });

        return toolResult({ success: true, data: { count: transactions.length, transactions } });
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
