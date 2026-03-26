# @ar-io/turbo-c2pa

C2PA client SDK for AR.IO. Two modes:

1. **Sign mode** — Signs images with C2PA Content Credentials using a remote signing oracle and uploads to Arweave
2. **Store mode** — Preserves existing C2PA manifests (from Adobe, Numbers Protocol, etc.) and uploads to Arweave for durable storage and SBR discovery

## What It Does

### Sign Mode (`signAndPrepare`)

Takes an unsigned image, creates a new C2PA manifest via the sidecar signing oracle, embeds it, and prepares for Arweave upload.

### Store Mode (`storeAndPrepare`)

Takes an image with an existing C2PA manifest, extracts and validates it using c2pa-node Reader, computes soft binding, and prepares for Arweave upload — **original bytes preserved unchanged**.

Both modes produce the same ANS-104 tag structure, so webhook indexing and SBR discovery work identically.

## Quick Start

### Prerequisites

- Bun 1.2+
- For sign mode: Trusthash Sidecar running with signing enabled (see `packages/trusthash-sidecar`)
- Ethereum wallet with [Turbo credits](https://turbo.ardrive.io)

### Setup

```bash
cp .env.example .env
# Edit .env: set ETH_PRIVATE_KEY and C2PA_TRUST_ANCHOR_PEM
```

Generate dev certificates (one-time, sign mode only):

```bash
cd ../trusthash-sidecar
./scripts/generate-dev-cert.sh
# Copy the C2PA_TRUST_ANCHOR_PEM value to packages/turbo-c2pa/.env
```

### Demo

```bash
# Terminal 1: Start sidecar (sign mode only)
cd packages/trusthash-sidecar
bun run dev

# Terminal 2: Sign + upload (new manifest)
cd packages/turbo-c2pa
bun run scripts/demo-upload.ts /path/to/image.jpg --source-type digitalCapture

# OR: Store + upload (preserve existing manifest)
bun run scripts/demo-upload.ts /path/to/image-with-c2pa.jpg --store
```

## API

### `signAndPrepare(options)` — Sign Mode

Creates a new C2PA manifest and embeds it in the image.

```typescript
import { signAndPrepare, RemoteSigner } from '@ar-io/turbo-c2pa';

const signer = new RemoteSigner('http://localhost:3003');
const result = await signAndPrepare({
  imageBuffer: fs.readFileSync('photo.jpg'),
  remoteSigner: signer,
  manifestRepoUrl: 'http://localhost:3003/v1',
  trustAnchorPem: caCertPem,
  digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
});

// result.signedBuffer — image with embedded C2PA manifest
// result.tags — ANS-104 tags for Arweave upload
// result.manifestId — C2PA manifest URN
// result.assetHash — SHA-256 of original image
// result.pHashHex — perceptual hash
```

### `storeAndPrepare(options)` — Store Mode

Extracts and validates an existing C2PA manifest, preserves original bytes.

```typescript
import { storeAndPrepare } from '@ar-io/turbo-c2pa';

const result = await storeAndPrepare({
  imageBuffer: fs.readFileSync('adobe-signed-image.jpg'),
  manifestRepoUrl: 'http://localhost:3003/v1',
});

// result.imageBuffer — original bytes (unchanged)
// result.tags — ANS-104 tags for Arweave upload
// result.manifestId — extracted C2PA manifest ID
// result.validation — { valid: boolean, errors: string[] }
// result.existingClaimGenerator — e.g. "Adobe_Firefly"
// result.pHashHex — perceptual hash
```

### `uploadToArweave(options)`

Upload signed or stored image to Arweave via Turbo SDK.

```typescript
import { uploadToArweave } from '@ar-io/turbo-c2pa';

const upload = await uploadToArweave({
  signedBuffer: result.signedBuffer || result.imageBuffer,
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

## `digitalSourceType` (Sign Mode)

Required by C2PA spec for `c2pa.created` actions. The demo script accepts shorthand names:

| Shorthand                              | Full IPTC URI                                                              |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `digitalCapture`                       | `http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture`            |
| `trainedAlgorithmicMedia`              | `http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia`   |
| `compositeSynthetic`                   | `http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic`        |
| `algorithmicMedia`                     | `http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia`          |
| `minorHumanEdits`                      | `http://cv.iptc.org/newscodes/digitalsourcetype/minorHumanEdits`           |
| `compositeWithTrainedAlgorithmicMedia` | `http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgo…` |

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
| `DIGITAL_SOURCE_TYPE`   | No       | Default digital source type (sign mode)                    |

## Architecture

```
                    ┌──────────────────────────────────┐
                    │        turbo-c2pa SDK             │
                    │                                   │
  Pre-signed ──────►│  storeAndPrepare()                │
  image             │    c2pa-node Reader (extract +    │
                    │    validate existing manifest)    │
                    │                                   │
  Unsigned  ───────►│  signAndPrepare()                 │
  image             │    c2pa-node Builder ──► Sidecar  │
                    │    (create new manifest)  /v1/sign│
                    │                                   │
                    │  Both paths:                      │
                    │    detectContentType()             │
                    │    computePHash()                  │
                    │    buildTags()                     │
                    └──────────┬────────────────────────┘
                               │
                               ▼
                    uploadToArweave() ──► Arweave
                                          ANS-104 tags
                                              │
                                              ▼
                                      AR.IO Gateway
                                        Webhook ──► Trusthash Sidecar
                                                     SBR API discovery
```

## Tests

```bash
bun test    # 37 tests (sign mode, store mode, tags, detection, signer)
```
