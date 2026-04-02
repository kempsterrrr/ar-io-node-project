import type { AgenticWay } from '@agenticway/sdk';
import {
  createStoreTool,
  createRetrieveTool,
  createVerifyTool,
  createSearchTool,
  createQueryTool,
  createResolveTool,
} from './tools.js';

export {
  createStoreTool,
  createRetrieveTool,
  createVerifyTool,
  createSearchTool,
  createQueryTool,
  createResolveTool,
};

/**
 * Create all AgenticWay tools for the Vercel AI SDK.
 *
 * Usage:
 * ```ts
 * import { AgenticWay } from '@agenticway/sdk';
 * import { createAgenticWayTools } from '@agenticway/adapter-vercel-ai';
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 *
 * const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });
 * const tools = createAgenticWayTools(client);
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   tools,
 *   prompt: 'Store "hello world" permanently on Arweave',
 * });
 * ```
 */
export function createAgenticWayTools(client: AgenticWay) {
  return {
    arweaveStore: createStoreTool(client),
    arweaveRetrieve: createRetrieveTool(client),
    arweaveVerify: createVerifyTool(client),
    arweaveSearch: createSearchTool(client),
    arweaveQuery: createQueryTool(client),
    arweaveResolve: createResolveTool(client),
  };
}
