# @agenticway/adapter-vercel-ai

Vercel AI SDK adapter for [@agenticway/sdk](../sdk/) — gives AI agents tools to permanently store, retrieve, verify, and query data on Arweave.

## Install

```bash
pnpm add @agenticway/adapter-vercel-ai @agenticway/sdk ai zod
```

## Quick Start

```ts
import { AgenticWay } from '@agenticway/sdk';
import { createAgenticWayTools } from '@agenticway/adapter-vercel-ai';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const client = new AgenticWay({ gatewayUrl: 'http://localhost:3000' });
const tools = createAgenticWayTools(client);

const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  prompt: 'Store the text "hello world" permanently on Arweave',
});
```

## Tools

| Tool              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `arweaveStore`    | Store data permanently on Arweave                    |
| `arweaveRetrieve` | Retrieve data by transaction ID or ArNS name         |
| `arweaveVerify`   | Verify on-chain existence and data integrity         |
| `arweaveSearch`   | Find visually similar content via perceptual hashing |
| `arweaveQuery`    | Query transactions by tags, owners, and block ranges |
| `arweaveResolve`  | Resolve ArNS names to Arweave transaction IDs        |

## Individual Tools

You can also import individual tool factories:

```ts
import { createStoreTool, createRetrieveTool } from '@agenticway/adapter-vercel-ai';

const tools = {
  store: createStoreTool(client),
  retrieve: createRetrieveTool(client),
};
```

## Configuration

The adapter wraps an `AgenticWay` SDK instance. See the [SDK README](../sdk/README.md) for configuration options (gateway URL, trusthash sidecar, wallet, etc.).

For search functionality, configure `trusthashUrl` in the SDK:

```ts
const client = new AgenticWay({
  gatewayUrl: 'http://localhost:3000',
  trusthashUrl: 'http://localhost:3001',
});
```
