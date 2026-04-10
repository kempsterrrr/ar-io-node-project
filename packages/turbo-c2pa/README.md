# @ar-io/turbo-c2pa

C2PA client SDK for AR.IO. Four modes:

1. **Sign mode** — Signs images with C2PA Content Credentials using a remote signing oracle and uploads to Arweave
2. **Store mode** — Preserves existing C2PA manifests (from Adobe, Numbers Protocol, etc.) and uploads to Arweave for durable storage and SBR discovery
3. **Manifest mode** — Signs images but uploads only the raw JUMBF manifest bytes (not the image)
4. **Proof mode** — Creates a lightweight proof-locator pointing to a remote manifest (e.g. Adobe's repository). Auto-detects the manifest URL from XMP `dcterms:provenance`.

## What It Does

### Sign Mode (`signAndPrepare`)

Takes an unsigned image, creates a new C2PA manifest via the sidecar signing oracle, embeds it, and prepares for Arweave upload.

### Store Mode (`storeAndPrepare`)

Takes an image with an existing C2PA manifest, extracts and validates it using c2pa-node Reader, computes soft binding, and prepares for Arweave upload — **original bytes preserved unchanged**.

### Manifest Mode (`signManifestAndPrepare`)

Signs an image to create a C2PA manifest, but uploads **only the manifest bytes** to Arweave — not the image. Useful when you want to store manifests separately from assets.

### Proof Mode (`proofAndPrepare`)

Creates a proof-locator record pointing to a remote manifest URL. No signing required. The sidecar will fetch-through to the remote URL with digest verification. If the image has `dcterms:provenance` in its XMP metadata, the URL is auto-detected — matching the c2pa-rs reference implementation.

All modes produce ANS-104 tags, so webhook indexing and SBR discovery work identically.

## Quick Start

### Prerequisites

- Node.js 20+ and pnpm
- For sign/manifest mode: Trusthash Sidecar running with signing enabled (see `packages/trusthash-sidecar`)
- Ethereum wallet with [Turbo credits](https://turbo.ardrive.io)

### Setup

```bash
cp .env.example .env
# Edit .env: set ETH_PRIVATE_KEY and C2PA_TRUST_ANCHOR_PEM
```

Generate dev certificates (one-time, sign/manifest mode only):

```bash
cd ../trusthash-sidecar
./scripts/generate-dev-cert.sh
# Copy the C2PA_TRUST_ANCHOR_PEM value to packages/turbo-c2pa/.env
```

### Demo

```bash
# Terminal 1: Start sidecar (sign/manifest mode only)
cd packages/trusthash-sidecar
pnpm run dev

# Terminal 2: Sign + upload (new manifest, full image)
cd packages/turbo-c2pa
pnpm exec tsx scripts/demo-upload.ts /path/to/image.jpg --source-type digitalCapture

# Store + upload (preserve existing manifest)
pnpm exec tsx scripts/demo-upload.ts /path/to/image-with-c2pa.jpg --store

# Manifest-only upload (sign, upload just the manifest bytes)
pnpm exec tsx scripts/demo-upload.ts /path/to/image.jpg --manifest --source-type digitalCapture

# Proof-locator (point to remote manifest, auto-detect URL from XMP)
pnpm exec tsx scripts/demo-upload.ts /path/to/adobe-signed.jpg --proof \
  --manifest-id "adobe:urn:uuid:..."

# Proof-locator (explicit URL)
pnpm exec tsx scripts/demo-upload.ts /path/to/image.jpg --proof \
  --manifest-id "urn:c2pa:..." \
  --manifest-fetch-url "https://cai-manifests.adobe.com/manifests/..."
```

## API

### `signAndPrepare(options)` — Sign Mode

Creates a new C2PA manifest and embeds it in the image.

```typescript
import { signAndPrepare, RemoteSigner } from '@ar-io/turbo-c2pa';

const signer = new RemoteSigner('http://localhost:3003/v1');
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

### `signManifestAndPrepare(options)` — Manifest Mode

Signs an image but returns only the manifest bytes for upload.

```typescript
import { signManifestAndPrepare, RemoteSigner } from '@ar-io/turbo-c2pa';

const signer = new RemoteSigner('http://localhost:3003/v1');
const result = await signManifestAndPrepare({
  imageBuffer: fs.readFileSync('photo.jpg'),
  remoteSigner: signer,
  manifestRepoUrl: 'http://localhost:3003/v1',
  digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
});

// result.manifestBytes — raw JUMBF manifest store bytes
// result.tags — ANS-104 tags (Content-Type: application/c2pa)
// result.assetContentType — original image MIME type
// result.manifestStoreHash — SHA-256 of manifest bytes
```

### `proofAndPrepare(options)` — Proof Mode

Creates a proof-locator pointing to a remote manifest. Auto-detects URL from XMP.

```typescript
import { proofAndPrepare } from '@ar-io/turbo-c2pa';

const result = await proofAndPrepare({
  imageBuffer: fs.readFileSync('adobe-signed.jpg'),
  // manifestFetchUrl auto-detected from XMP dcterms:provenance if omitted
  manifestId: 'adobe:urn:uuid:5f37e182-3687-462e-a7fb-573462780391',
  manifestRepoUrl: 'https://ario.agenticway.io/trusthash',
});

// result.proofPayload — JSON proof-locator record
// result.tags — ANS-104 tags (Content-Type: application/json)
// result.manifestFetchUrl — remote manifest URL (auto-detected or provided)
// result.manifestStoreHash — SHA-256 of remote manifest
```

### `uploadToArweave(options)`

Upload any mode's output to Arweave via Turbo SDK.

```typescript
import { uploadToArweave } from '@ar-io/turbo-c2pa';

const upload = await uploadToArweave({
  dataBuffer: result.signedBuffer || result.manifestBytes || result.proofPayload,
  tags: result.tags,
  ethPrivateKey: process.env.ETH_PRIVATE_KEY,
  gatewayUrl: 'https://turbo-gateway.com',
});

// upload.txId — Arweave transaction ID
// upload.viewUrl — URL to view the data
```

### `extractProvenanceUrl(imageBuffer)`

Extract `dcterms:provenance` from XMP metadata for remote manifest discovery.

```typescript
import { extractProvenanceUrl } from '@ar-io/turbo-c2pa';

const url = extractProvenanceUrl(fs.readFileSync('adobe-signed.jpg'));
// "https://cai-manifests.adobe.com/manifests/adobe-urn-uuid-..."
```

### Other Exports

- `RemoteSigner` — fetches certs and signs via sidecar (endpoint should include API path, e.g. `http://localhost:3003/v1`)
- `buildTags(options)` — constructs ANS-104 tag array
- `detectContentType(buffer)` — magic byte MIME detection
- `computePHash(buffer)` — 64-bit perceptual hash
- `signManifest(options)` — low-level c2pa-node signing

## `digitalSourceType` (Sign/Manifest Mode)

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
| `DIGITAL_SOURCE_TYPE`   | No       | Default digital source type (sign/manifest mode)           |

## Architecture

```
                    ┌───────────────────────────────────────┐
                    │           turbo-c2pa SDK               │
                    │                                        │
  Pre-signed ──────►│  storeAndPrepare()                     │
  image             │    c2pa-node Reader (extract + validate│
                    │    existing manifest)                  │
                    │                                        │
  Unsigned  ───────►│  signAndPrepare()                      │
  image             │  signManifestAndPrepare()              │
                    │    c2pa-node Builder ──► Sidecar /sign │
                    │                                        │
  Image with ──────►│  proofAndPrepare()                     │
  remote manifest   │    XMP dcterms:provenance extraction   │
                    │    (no sidecar needed)                 │
                    │                                        │
                    │  All paths: detectContentType(),       │
                    │  computePHash(), buildTags()            │
                    └──────────┬────────────────────────────┘
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
pnpm test    # 63 tests (sign, store, manifest, proof, tags, detection, signer, XMP)
```
