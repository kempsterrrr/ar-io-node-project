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
 * Create all AgenticWay tools for LangChain.
 *
 * Usage:
 * ```ts
 * import { AgenticWay } from '@agenticway/sdk';
 * import { createAgenticWayTools } from '@agenticway/adapter-langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
 *
 * const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });
 * const tools = createAgenticWayTools(client);
 *
 * const llm = new ChatOpenAI({ modelName: 'gpt-4o' });
 * const agent = createToolCallingAgent({ llm, tools, prompt });
 * const executor = new AgentExecutor({ agent, tools });
 *
 * const result = await executor.invoke({
 *   input: 'Store "hello world" permanently on Arweave',
 * });
 * ```
 */
export function createAgenticWayTools(client: AgenticWay) {
  return [
    createStoreTool(client),
    createRetrieveTool(client),
    createVerifyTool(client),
    createSearchTool(client),
    createQueryTool(client),
    createResolveTool(client),
  ];
}
