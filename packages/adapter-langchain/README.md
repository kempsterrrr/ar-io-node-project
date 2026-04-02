# @agenticway/adapter-langchain

LangChain adapter for [@agenticway/sdk](../sdk/) — gives AI agents tools to permanently store, retrieve, verify, and query data on Arweave.

## Install

```bash
pnpm add @agenticway/adapter-langchain @agenticway/sdk @langchain/core zod
```

## Quick Start

```ts
import { AgenticWay } from '@agenticway/sdk';
import { createAgenticWayTools } from '@agenticway/adapter-langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });
const tools = createAgenticWayTools(client);

const llm = new ChatOpenAI({ modelName: 'gpt-4o' });
const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful assistant with access to Arweave storage.'],
  ['human', '{input}'],
  ['placeholder', '{agent_scratchpad}'],
]);

const agent = createToolCallingAgent({ llm, tools, prompt });
const executor = new AgentExecutor({ agent, tools });

const result = await executor.invoke({
  input: 'Store "hello world" permanently on Arweave',
});
```

## Tools

| Tool               | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `arweave_store`    | Store data permanently on Arweave                    |
| `arweave_retrieve` | Retrieve data by transaction ID or ArNS name         |
| `arweave_verify`   | Verify on-chain existence and data integrity         |
| `arweave_search`   | Find visually similar content via perceptual hashing |
| `arweave_query`    | Query transactions by tags, owners, and block ranges |
| `arweave_resolve`  | Resolve ArNS names to Arweave transaction IDs        |

## Individual Tools

```ts
import { createStoreTool, createRetrieveTool } from '@agenticway/adapter-langchain';

const tools = [createStoreTool(client), createRetrieveTool(client)];
```

## Notes

- All tool outputs are JSON strings (LangChain convention for `DynamicStructuredTool`)
- The adapter uses `@langchain/core` — compatible with any LangChain model provider
- For search functionality, configure `trusthashUrl` in the SDK config
