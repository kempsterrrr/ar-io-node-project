# @agenticway/sdk

TypeScript SDK for permanently storing, retrieving, verifying, and querying data on Arweave — with built-in integrity anchoring via SHA-256 hashing and Merkle trees.

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

// --- Integrity Anchoring (Layer 1) ---

// Anchor data: store a SHA-256 hash proof on Arweave
const anchor = await client.anchor({
  data: Buffer.from(JSON.stringify({ decision: 'approved', confidence: 0.98 })),
  metadata: { agent: 'compliance-bot', taskId: 'audit-77' },
});
console.log(`Anchored: txId=${anchor.txId}, hash=${anchor.hash}`);

// Verify data against an existing anchor
const check = await client.verifyAnchor({
  data: Buffer.from(JSON.stringify({ decision: 'approved', confidence: 0.98 })),
  txId: anchor.txId,
});
console.log(`Integrity valid: ${check.valid}`);

// Batch anchor: Merkle tree for multiple items
const batch = await client.batchAnchor({
  items: [
    { data: Buffer.from('document-1') },
    { data: Buffer.from('document-2') },
    { data: Buffer.from('document-3') },
  ],
});
console.log(`Batch root: ${batch.merkleRoot}, proofs: ${batch.proofs.length}`);
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

### `client.anchor(options)`

Anchor data on Arweave by storing its SHA-256 hash as a permanent integrity proof. Requires `turboWallet`.

```typescript
const result = await client.anchor({
  data: Buffer.from('any data — text, JSON, binary'),
  metadata: { agent: 'my-bot', purpose: 'audit-trail' }, // optional tags
});
// Returns: { txId, hash, timestamp }
```

The anchor transaction is tagged with `Data-Protocol: AgenticWay-Integrity` and `Type: integrity-anchor` for easy querying.

### `client.verifyAnchor(options)`

Verify data against an existing integrity anchor. Re-hashes the data and compares it against the hash stored on-chain.

```typescript
const result = await client.verifyAnchor({
  data: originalData,
  txId: 'anchor-transaction-id',
});
// Returns: { valid, hash, anchoredHash, blockHeight, timestamp }
```

| Field          | Description                                   |
| -------------- | --------------------------------------------- |
| `valid`        | `true` if the data matches the anchored hash  |
| `hash`         | SHA-256 of the provided data (hex)            |
| `anchoredHash` | Hash stored on-chain, or `null` if not found  |
| `blockHeight`  | Arweave block height of the anchor, or `null` |
| `timestamp`    | ISO timestamp of the anchor block, or `null`  |

### `client.batchAnchor(options)`

Anchor multiple items in a single transaction using a Merkle tree. Each item gets an individual inclusion proof. Requires `turboWallet`.

```typescript
const result = await client.batchAnchor({
  items: [
    { data: Buffer.from('item-1') },
    { data: Buffer.from('item-2') },
    { data: Buffer.from('item-3') },
  ],
  metadata: { batch: 'daily-audit' }, // optional tags on the batch tx
});
// Returns: { txId, merkleRoot, proofs, timestamp }

// Each proof can independently verify an item against the Merkle root:
import { verifyProof } from '@agenticway/sdk';

for (const p of result.proofs) {
  const valid = verifyProof({
    index: p.index,
    leaf: p.hash,
    path: p.proof,
    root: result.merkleRoot,
  });
  console.log(`Item ${p.index}: ${valid}`); // true
}
```

### `client.info()`

Get gateway metadata.

```typescript
const info = await client.info();
// Returns: { processId, release, ... }
```

## Merkle Tree Utilities

Standalone Merkle tree functions are exported for direct use:

```typescript
import { sha256Hex, buildMerkleTree, generateProof, verifyProof } from '@agenticway/sdk';

// Hash data
const hash = sha256Hex(Buffer.from('hello'));

// Build a tree from leaf hashes
const tree = buildMerkleTree([hash1, hash2, hash3, hash4]);
console.log(tree.root); // Merkle root (hex)

// Generate an inclusion proof for leaf at index 2
const proof = generateProof(tree, 2);

// Verify the proof
const valid = verifyProof(proof); // true
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
