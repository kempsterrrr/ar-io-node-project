# @agenticway/provenance

C2PA content provenance with Arweave integrity anchoring for AI-generated content.

Combines [C2PA content credentials](https://c2pa.org/) (Layer 2) with Arweave hash anchoring (Layer 1) to provide dual-proof provenance chains — cryptographic proof of who created content, how, and when, permanently anchored on-chain.

## Install

```bash
pnpm add @agenticway/provenance @agenticway/sdk
```

## Quick Start

```typescript
import { ContentProvenance } from '@agenticway/provenance';

const provenance = new ContentProvenance({
  gatewayUrl: 'https://ario.agenticway.io',
  trusthashUrl: 'http://localhost:5100',
  turboWallet: process.env.TURBO_WALLET,
});

// Sign content with C2PA and anchor manifest hash on Arweave
const result = await provenance.signAndAnchor({
  data: imageBuffer,
  sourceType: 'trainedAlgorithmicMedia',
});

console.log(result.contentTxId); // Arweave tx with C2PA-signed content
console.log(result.anchorTxId); // Layer 1 integrity anchor
console.log(result.manifestId); // C2PA manifest ID

// Verify provenance (C2PA + anchor)
const verification = await provenance.verify({
  contentTxId: result.contentTxId,
  anchorTxId: result.anchorTxId,
});

console.log(verification.valid); // true
console.log(verification.c2pa.manifestId); // urn:c2pa:...
console.log(verification.anchor?.anchoredHash); // SHA-256 hash

// Query provenance records
const records = await provenance.queryProvenance({
  contentType: 'image/jpeg',
  first: 10,
});

// Search for visually similar content
const similar = await provenance.searchSimilar({
  image: imageBuffer,
  threshold: 10,
});
```

## API

### `ContentProvenance`

Main class combining C2PA signing with Arweave anchoring.

#### `signAndAnchor(options)` → `SignAndAnchorResult`

Signs content with a C2PA manifest and anchors the manifest metadata on Arweave.

- Creates C2PA manifest (signer identity, digital source type, action history)
- Uploads signed content to Arweave
- Anchors manifest metadata hash as Layer 1 integrity proof

Requires `turboWallet` in config.

#### `verify(options)` → `VerifyProvenanceResult`

Verifies content provenance with three checks:

1. On-chain existence and data integrity
2. C2PA tag validation (protocol, manifest ID, storage mode)
3. Layer 1 anchor verification

#### `queryProvenance(options)` → `QueryProvenanceResult`

Queries C2PA-tagged transactions from Arweave. Supports filtering by manifest ID, content type, and owner.

#### `searchSimilar(options)` → `SearchResult`

Finds visually similar content using perceptual hashing via the trusthash sidecar.

## Digital Source Types

IPTC digital source types for describing how content was created:

| Type                                   | Description                  |
| -------------------------------------- | ---------------------------- |
| `trainedAlgorithmicMedia`              | AI-generated (trained model) |
| `compositeWithTrainedAlgorithmicMedia` | Composite with AI elements   |
| `algorithmicMedia`                     | Algorithmically generated    |
| `digitalCapture`                       | Digital capture              |
| `digitalArt`                           | Digital artwork              |
| `composite`                            | Composite media              |
| `minorHumanEdits`                      | Minor human edits            |
| `dataDrivenMedia`                      | Data-driven media            |

## Architecture

```
AI Agent generates content
        ↓
  C2PA manifest created
  (identity, process, lineage)
        ↓
  Content + manifest uploaded to Arweave
        ↓
  Manifest hash anchored via Layer 1
  (permanent, chain-verifiable proof)
        ↓
  Dual verification available:
  ├── C2PA validator (content credentials)
  └── Arweave proof (integrity anchor)
```

## AIUC-1 Compliance Mapping

- **E004** (accountability): Signer identity in C2PA manifest
- **E017** (transparency): Full provenance chain
- **D001/D002** (hallucination prevention): Source-to-output lineage
- **A004/A007** (IP protection): Content lineage tracking
