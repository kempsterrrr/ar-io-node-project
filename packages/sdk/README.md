# @ar-io/sdk

TypeScript SDK for storing, retrieving, verifying, and searching data on Arweave with C2PA provenance.

## Install

```bash
npm install @ar-io/sdk
```

### Optional dependencies

For C2PA manifest signing (store with provenance):

```bash
npm install @contentauth/c2pa-node sharp blockhash-core ethers
```

## Quickstart

```typescript
import { ArIO } from '@ar-io/sdk';

const ario = new ArIO({
  gatewayUrl: 'https://ario.agenticway.io',
  signingOracleUrl: 'https://ario.agenticway.io/trusthash/v1',
  turboWallet: process.env.ETH_PRIVATE_KEY,
});

// Store data with C2PA provenance
const stored = await ario.store({
  data: imageBuffer,
  sourceType: 'digitalCapture',
});
console.log(`Stored: ${stored.viewUrl}`);

// Retrieve data
const retrieved = await ario.retrieve(stored.txId);
console.log(`Content-Type: ${retrieved.contentType}`);

// Verify provenance
const verification = await ario.verify(stored.txId);
console.log(`Valid: ${verification.valid}`);

// Search for similar content
const matches = await ario.search({ phash: 'a5a5a5a5a5a5a5a5' });
console.log(`Found ${matches.total} matches`);
```

## API Reference

### `new ArIO(config)`

| Option             | Type     | Required | Description                              |
| ------------------ | -------- | -------- | ---------------------------------------- |
| `gatewayUrl`       | `string` | Yes      | AR.IO gateway URL                        |
| `signingOracleUrl` | `string` | No       | Trusthash sidecar URL (for store/search) |
| `turboWallet`      | `string` | No       | Ethereum private key for uploads         |
| `timeoutMs`        | `number` | No       | Request timeout (default: 15000)         |

### `ario.store(options)`

Store data on Arweave with optional C2PA provenance.

```typescript
const result = await ario.store({
  data: buffer, // Buffer | Uint8Array
  sourceType: 'digitalCapture', // IPTC digital source type
  mode: 'sign', // 'sign' (default) or 'preserve'
  metadata: { agent: 'my-bot' }, // optional custom tags
});
// Returns: { txId, manifestId, assetHash, viewUrl }
```

### `ario.retrieve(id)`

Fetch data by Arweave transaction ID or ArNS name.

```typescript
const result = await ario.retrieve('4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM');
// Returns: { data: Buffer, contentType: string, tags: Tag[] }
```

### `ario.verify(txId)`

Verify the provenance and integrity of an Arweave transaction.

```typescript
const result = await ario.verify(txId);
// Returns: { verificationId, valid, tier, existence, integrity, metadata, links }
```

### `ario.search(options)`

Search for similar content by perceptual hash or image.

```typescript
// By pre-computed hash
const result = await ario.search({ phash: 'a5a5a5a5a5a5a5a5', threshold: 10, limit: 10 });

// By image (sidecar computes hash)
const result = await ario.search({ image: imageBuffer });

// Returns: { results: SearchMatch[], total: number }
```

### `ario.info()`

Get gateway metadata.

```typescript
const info = await ario.info();
// Returns: { processId, release, ... }
```

## Advanced: Direct client access

```typescript
const { gateway, signer, manifests, verifier } = ario;

// Gateway client
await gateway.fetchTransaction(txId);
await gateway.fetchTransactionTags(txId);
await gateway.healthcheck();

// Signing oracle
await signer.getCertificateChain();
await signer.sign(payload);

// Manifest repository
await manifests.getManifest(manifestId);
await manifests.searchSimilar(phash, { threshold: 10 });
await manifests.matchByContent(imageBuffer);
await manifests.matchByBinding('org.ar-io.phash', value);

// Verify client
await verifier.verify(txId);
await verifier.getResult(verificationId);
```

## C2PA Utilities

Low-level utilities re-exported for advanced use:

```typescript
import { detectContentType, buildTags, uploadToArweave, PROTOCOL_NAME } from '@ar-io/sdk';

const mime = detectContentType(buffer);  // 'image/jpeg' | null
const tags = buildTags({ contentType: 'image/jpeg', manifestId: '...', ... });
```

## License

MIT
