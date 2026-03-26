# @ar-io/turbo-c2pa

C2PA signing client SDK for AR.IO. Signs images with C2PA Content Credentials using a remote signing oracle (the Trusthash Sidecar) and uploads them to Arweave via Turbo SDK.

## What It Does

1. Takes an image file
2. Computes pHash (perceptual hash) for soft binding
3. Signs a C2PA manifest using `@contentauth/c2pa-node` with remote signing via the sidecar
4. Embeds the manifest in the image (Mode 1: full embed)
5. Builds ANS-104 tags for Arweave discovery
6. Uploads to Arweave via `@ardrive/turbo-sdk`

The signed image is verifiable at [contentcredentials.org/verify](https://contentcredentials.org/verify).

## Quick Start

### Prerequisites

- Bun 1.2+
- Trusthash Sidecar running with signing enabled (see `packages/trusthash-sidecar`)
- Ethereum wallet with [Turbo credits](https://turbo.ardrive.io)

### Setup

```bash
cp .env.example .env
# Edit .env: set ETH_PRIVATE_KEY and C2PA_TRUST_ANCHOR_PEM
```

Generate dev certificates (one-time):

```bash
cd ../trusthash-sidecar
./scripts/generate-dev-cert.sh
# Copy the C2PA_TRUST_ANCHOR_PEM value to packages/turbo-c2pa/.env
```

### Demo

```bash
# Terminal 1: Start sidecar
cd packages/trusthash-sidecar
bun run dev

# Terminal 2: Sign + upload
cd packages/turbo-c2pa
bun run scripts/demo-upload.ts /path/to/image.jpg
```

Output:

```
Signed image: 80,382 bytes (embedded C2PA manifest)
Uploaded to Arweave: tx abc123...
View: https://turbo-gateway.com/abc123...
```

## API

### `signAndPrepare(options)`

Full Mode 1 flow: detect → hash → pHash → sign → build tags.

```typescript
import { signAndPrepare, RemoteSigner } from '@ar-io/turbo-c2pa';

const signer = new RemoteSigner('http://localhost:3003');
const result = await signAndPrepare({
  imageBuffer: fs.readFileSync('photo.jpg'),
  remoteSigner: signer,
  manifestRepoUrl: 'http://localhost:3003/v1',
  trustAnchorPem: caCertPem, // from generate-dev-cert.sh
});

// result.signedBuffer — image with embedded C2PA manifest
// result.tags — ANS-104 tags for Arweave upload
// result.manifestId — C2PA manifest URN
// result.assetHash — SHA-256 of original image
// result.pHashHex — perceptual hash
```

### `uploadToArweave(options)`

Upload signed image to Arweave via Turbo SDK.

```typescript
import { uploadToArweave } from '@ar-io/turbo-c2pa';

const upload = await uploadToArweave({
  signedBuffer: result.signedBuffer,
  tags: result.tags,
  ethPrivateKey: process.env.ETH_PRIVATE_KEY,
  gatewayUrl: 'https://turbo-gateway.com',
});

// upload.txId — Arweave transaction ID
// upload.viewUrl — URL to view the image
```

### Other Exports

- `RemoteSigner` — fetches certs and signs via sidecar
- `buildTags(options)` — constructs ANS-104 tag array
- `detectContentType(buffer)` — magic byte MIME detection
- `computePHash(buffer)` — 64-bit perceptual hash
- `signManifest(options)` — low-level c2pa-node signing

## Identity Assertion (Experimental)

CAWG identity assertion support (`cawg.identity`) is built but **disabled by default**. The c2pa-rs library used by validators does not yet support reading identity assertions — it panics with `not yet implemented`. Pass `--identity` to the demo script or `includeIdentity: true` to `signAndPrepare()` to enable.

## Environment Variables

| Variable                | Required | Description                                                |
| ----------------------- | -------- | ---------------------------------------------------------- |
| `ETH_PRIVATE_KEY`       | Yes      | Ethereum private key for Turbo uploads                     |
| `SIDECAR_URL`           | No       | Sidecar base URL (default: `http://localhost:3003`)        |
| `GATEWAY_URL`           | No       | Gateway for viewing (default: `https://turbo-gateway.com`) |
| `C2PA_TRUST_ANCHOR_PEM` | Dev only | Base64 CA cert from `generate-dev-cert.sh`                 |
| `MANIFEST_REPO_URL`     | No       | SBR API URL (default: `SIDECAR_URL/v1`)                    |

## Architecture

```
Image file
    │
    ▼
turbo-c2pa SDK ──────► Trusthash Sidecar
  │ signAndPrepare()     POST /v1/sign (COSE signing)
  │                      GET /v1/cert  (X.509 chain)
  │
  ├── c2pa-node (manifest construction + embedding)
  ├── sharp + blockhash-core (pHash computation)
  ├── @ar-io/c2pa-protocol (tag constants)
  │
  ▼
Turbo SDK ──────────► Arweave
  uploadToArweave()     ANS-104 data item + tags
                        │
                        ▼
                    AR.IO Gateway ──► Trusthash Sidecar
                      GraphQL index     Webhook indexing
                                        SBR API discovery
```
