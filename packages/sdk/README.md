# @agenticway/sdk

TypeScript SDK for permanently storing, retrieving, verifying, and querying data on Arweave.

## Install

```bash
npm install @agenticway/sdk
```

## Quickstart

```typescript
import { AgenticWay } from '@agenticway/sdk';

const client = new AgenticWay({
  gatewayUrl: 'https://ario.agenticway.io',
  turboWallet: process.env.ETH_PRIVATE_KEY,
});

// Store any data permanently
const stored = await client.store({
  data: Buffer.from(JSON.stringify({ analysis: 'complete', score: 0.95 })),
  contentType: 'application/json',
  tags: { agent: 'research-bot', taskId: 'task-42' },
});
console.log(`Stored: ${stored.viewUrl}`);

// Retrieve data
const retrieved = await client.retrieve(stored.txId);
console.log(`Content-Type: ${retrieved.contentType}`);

// Verify on-chain existence
const verification = await client.verify(stored.txId);
console.log(`Valid: ${verification.valid}`);

// Query for transactions by tags
const results = await client.query({
  tags: [{ name: 'agent', values: ['research-bot'] }],
  first: 10,
});
console.log(`Found ${results.edges.length} transactions`);

// Resolve ArNS name
const resolved = await client.resolve('my-data');
console.log(`Resolved to: ${resolved.txId}`);
```

## API Reference

### `new AgenticWay(config)`

| Option         | Type     | Required | Description                        |
| -------------- | -------- | -------- | ---------------------------------- |
| `gatewayUrl`   | `string` | Yes      | AR.IO gateway URL                  |
| `trusthashUrl` | `string` | No       | Trusthash sidecar URL (provenance) |
| `turboWallet`  | `string` | No       | Ethereum private key for uploads   |
| `timeoutMs`    | `number` | No       | Request timeout (default: 15000)   |

### `client.store(options)`

Store any data permanently on Arweave.

```typescript
// Plain data (text, JSON, binary)
const result = await client.store({
  data: Buffer.from('hello world'),
  contentType: 'text/plain',
  tags: { agent: 'my-bot' },
});
// Returns: { txId, viewUrl }

// With C2PA provenance (requires trusthashUrl + optional deps)
const result = await client.store({
  data: imageBuffer,
  contentType: 'image/jpeg',
  provenance: { sourceType: 'compositeWithTrainedAlgorithmicMedia' },
});
// Returns: { txId, viewUrl, provenance: { manifestId, assetHash } }
```

### `client.retrieve(id)`

Fetch data by Arweave transaction ID or ArNS name.

```typescript
const result = await client.retrieve('4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM');
// Returns: { data: Buffer, contentType: string, tags: Tag[] }
```

### `client.verify(txId)`

Verify the on-chain existence and integrity of an Arweave transaction.

```typescript
const result = await client.verify(txId);
// Returns: { verificationId, valid, tier, existence, integrity, metadata, links }
```

### `client.query(options)`

Query for transactions on Arweave via GraphQL.

```typescript
const result = await client.query({
  tags: [{ name: 'agent', values: ['research-bot'] }],
  owners: ['wallet-address'],
  first: 25,
  sort: 'HEIGHT_DESC',
});
// Returns: { edges: QueryEdge[], pageInfo: { hasNextPage, endCursor } }

// Paginate
const page2 = await client.query({
  tags: [{ name: 'agent', values: ['research-bot'] }],
  after: result.pageInfo.endCursor,
});
```

### `client.resolve(name)`

Resolve an ArNS name to an Arweave transaction ID.

```typescript
const result = await client.resolve('my-data');
// Returns: { txId, ttl, owner }
```

### `client.info()`

Get gateway metadata.

```typescript
const info = await client.info();
// Returns: { processId, release, ... }
```

## Advanced: Direct client access

```typescript
const { gateway, verifier } = client;

await gateway.fetchTransaction(txId);
await gateway.fetchTransactionTags(txId);
await gateway.queryGraphQL({ tags: [...] });
await gateway.resolveArNS(name);
await gateway.healthcheck();

await verifier.verify(txId);
```

## License

MIT
