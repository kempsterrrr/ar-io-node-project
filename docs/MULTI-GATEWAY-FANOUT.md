# Multi-Gateway Optimistic Indexing Fan-Out

Upload data to Arweave via Turbo and make it immediately queryable across multiple ar.io gateways.

## How It Works

1. **Upload**: SDK creates a signed ANS-104 DataItem, uploads it to Turbo
2. **Fan-out**: SDK POSTs the data item headers to each gateway's admin API (`POST /ar-io/admin/queue-data-item`)
3. **Optimistic indexing**: Gateways index the headers immediately — the item is queryable via GraphQL
4. **On-demand retrieval**: When a client requests the data, the gateway fetches bytes from Turbo's cache via `TRUSTED_GATEWAYS_URLS`
5. **Local caching**: After first retrieval, bytes are cached locally — subsequent requests are served from cache
6. **L1 settlement**: When the bundle settles on Arweave (minutes), gateways independently verify and promote the index entry to stable/verified

## SDK Usage

```typescript
import { AgenticWay } from '@agenticway/sdk';

const sdk = new AgenticWay({
  gatewayUrl: 'https://primary-gateway.example.com',
  turboWallet: process.env.ETH_PRIVATE_KEY,
  optimisticIndexTargets: [
    { url: 'https://gw2.example.com', adminApiKey: process.env.GW2_ADMIN_KEY },
    { url: 'https://gw3.example.com', adminApiKey: process.env.GW3_ADMIN_KEY },
  ],
});

const result = await sdk.store({
  data: Buffer.from('Hello, multi-gateway world!'),
  contentType: 'text/plain',
});

console.log(result.txId); // Arweave transaction ID
console.log(result.fanOutResults); // Per-gateway fan-out status
```

### Low-Level API

For direct control without the SDK orchestrator:

```typescript
import { createSignedDataItem, fanOutDataItem, uploadAndFanOut } from '@agenticway/sdk';

// Option 1: Combined upload + fan-out
const result = await uploadAndFanOut({
  data: Buffer.from('payload'),
  tags: [{ name: 'Content-Type', value: 'text/plain' }],
  ethPrivateKey: '0x...',
  gateways: [{ url: 'https://gw2.example.com', adminApiKey: 'key' }],
});

// Option 2: Fan out an already-uploaded item
const { header } = await createSignedDataItem(data, tags, ethPrivateKey);
const results = await fanOutDataItem(header, gateways, { timeoutMs: 10000, retries: 1 });
```

## Gateway Configuration

### Primary Gateway (where Turbo caches data)

```bash
ADMIN_API_KEY=your-secure-key

# Index all data items (or narrow to your app's protocol tags)
ANS104_UNBUNDLE_FILTER={"always": true}
ANS104_INDEX_FILTER={"always": true}

# Default retrieval order is fine for primary
# ON_DEMAND_RETRIEVAL_ORDER=s3,trusted-gateways,chunks,tx-data
```

### Secondary Gateways (receiving fan-out)

These gateways receive data item headers but need to fetch bytes from the primary:

```bash
ADMIN_API_KEY=this-gateways-key

ANS104_UNBUNDLE_FILTER={"always": true}
ANS104_INDEX_FILTER={"always": true}

# Critical: fetch from primary gateway first
TRUSTED_GATEWAYS_URLS={"https://primary-gateway.example.com": 2, "https://arweave.net": 1}
TRUSTED_GATEWAYS_REQUEST_TIMEOUT_MS=10000

# Try trusted gateways before slower chunk retrieval
ON_DEMAND_RETRIEVAL_ORDER=trusted-gateways,chunks,tx-data
```

### Docker Compose

The gateway's `docker-compose.yaml` must pass these env vars to the `core` service:

```yaml
- TRUSTED_GATEWAYS_URLS=${TRUSTED_GATEWAYS_URLS:-}
- TRUSTED_GATEWAYS_REQUEST_TIMEOUT_MS=${TRUSTED_GATEWAYS_REQUEST_TIMEOUT_MS:-}
- ON_DEMAND_RETRIEVAL_ORDER=${ON_DEMAND_RETRIEVAL_ORDER:-}
```

## Limitations

- **Optimistic data is unverified**: Items indexed via fan-out have `x-ar-io-stable: false` and `x-ar-io-verified: false` until the bundle settles on L1
- **Verify sidecar**: Cannot verify optimistically-indexed items — `/tx/{txId}` returns 404 until L1 settlement
- **Admin API required**: Each target gateway must have `ADMIN_API_KEY` set and the fan-out client must know each key
- **Data availability depends on primary**: If the primary gateway / Turbo cache is down, secondary gateways cannot serve the data bytes until L1 settlement

## Settings Reference

| Variable                              | Default                              | Purpose                                                                       |
| ------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `ADMIN_API_KEY`                       | (empty)                              | Protects admin endpoints. Fan-out sends this as `Authorization: Bearer <key>` |
| `ANS104_UNBUNDLE_FILTER`              | `{"never": true}`                    | Which bundles to unbundle. `queue-data-item` bypasses this                    |
| `ANS104_INDEX_FILTER`                 | `{"never": true}`                    | Which data items to index from unbundled bundles                              |
| `TRUSTED_GATEWAYS_URLS`               | (empty)                              | JSON map of gateway URLs to weight. Higher weight = tried first               |
| `TRUSTED_GATEWAYS_REQUEST_TIMEOUT_MS` | `10000`                              | Timeout when fetching from trusted gateways                                   |
| `ON_DEMAND_RETRIEVAL_ORDER`           | `s3,trusted-gateways,chunks,tx-data` | Priority order for fetching data on request                                   |
