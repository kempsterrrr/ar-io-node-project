# @agenticway/sdk

TypeScript SDK for permanently storing, retrieving, verifying, and querying data on Arweave.

## Install

```bash
npm install @agenticway/sdk
```

## Quickstart

```typescript
import { ArIO } from '@agenticway/sdk';

const ario = new ArIO({
  gatewayUrl: 'https://ario.agenticway.io',
  turboWallet: process.env.ETH_PRIVATE_KEY,
});

// Store any data permanently
const stored = await ario.store({
  data: Buffer.from(JSON.stringify({ analysis: 'complete', score: 0.95 })),
  contentType: 'application/json',
  tags: { agent: 'research-bot', taskId: 'task-42' },
});
console.log(`Stored: ${stored.viewUrl}`);

// Retrieve data
const retrieved = await ario.retrieve(stored.txId);
console.log(`Content-Type: ${retrieved.contentType}`);

// Verify on-chain existence
const verification = await ario.verify(stored.txId);
console.log(`Valid: ${verification.valid}`);

// Query for transactions by tags
const results = await ario.query({
  tags: [{ name: 'agent', values: ['research-bot'] }],
  first: 10,
});
console.log(`Found ${results.edges.length} transactions`);

// Resolve ArNS name
const resolved = await ario.resolve('my-data');
console.log(`Resolved to: ${resolved.txId}`);
```

## API Reference

### `new ArIO(config)`

| Option         | Type     | Required | Description                        |
| -------------- | -------- | -------- | ---------------------------------- |
| `gatewayUrl`   | `string` | Yes      | AR.IO gateway URL                  |
| `trusthashUrl` | `string` | No       | Trusthash sidecar URL (provenance) |
| `turboWallet`  | `string` | No       | Ethereum private key for uploads   |
| `timeoutMs`    | `number` | No       | Request timeout (default: 15000)   |

### `ario.store(options)`

Store any data permanently on Arweave.

```typescript
// Plain data (text, JSON, binary)
const result = await ario.store({
  data: Buffer.from('hello world'),
  contentType: 'text/plain',
  tags: { agent: 'my-bot' },
});
// Returns: { txId, viewUrl }

// With C2PA provenance (requires trusthashUrl + optional deps)
const result = await ario.store({
  data: imageBuffer,
  contentType: 'image/jpeg',
  provenance: { sourceType: 'compositeWithTrainedAlgorithmicMedia' },
});
// Returns: { txId, viewUrl, provenance: { manifestId, assetHash } }
```

### `ario.retrieve(id)`

Fetch data by Arweave transaction ID or ArNS name.

```typescript
const result = await ario.retrieve('4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM');
// Returns: { data: Buffer, contentType: string, tags: Tag[] }
```

### `ario.verify(txId)`

Verify the on-chain existence and integrity of an Arweave transaction.

```typescript
const result = await ario.verify(txId);
// Returns: { verificationId, valid, tier, existence, integrity, metadata, links }
```

### `ario.query(options)`

Query for transactions on Arweave via GraphQL.

```typescript
const result = await ario.query({
  tags: [{ name: 'agent', values: ['research-bot'] }],
  owners: ['wallet-address'],
  first: 25,
  sort: 'HEIGHT_DESC',
});
// Returns: { edges: QueryEdge[], pageInfo: { hasNextPage, endCursor } }

// Paginate
const page2 = await ario.query({
  tags: [{ name: 'agent', values: ['research-bot'] }],
  after: result.pageInfo.endCursor,
});
```

### `ario.resolve(name)`

Resolve an ArNS name to an Arweave transaction ID.

```typescript
const result = await ario.resolve('my-data');
// Returns: { txId, ttl, owner }
```

### `ario.info()`

Get gateway metadata.

```typescript
const info = await ario.info();
// Returns: { processId, release, ... }
```

## Advanced: Direct client access

```typescript
const { gateway, verifier } = ario;

await gateway.fetchTransaction(txId);
await gateway.fetchTransactionTags(txId);
await gateway.queryGraphQL({ tags: [...] });
await gateway.resolveArNS(name);
await gateway.healthcheck();

await verifier.verify(txId);
```

## License

MIT
