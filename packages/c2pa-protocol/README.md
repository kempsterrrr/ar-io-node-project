# @ar-io/c2pa-protocol

Shared C2PA tag schema constants and types for the AR.IO C2PA ecosystem. Used by both the Trusthash Sidecar and the `@ar-io/turbo-c2pa` client SDK to ensure tag names stay in sync.

## Usage

```typescript
import {
  PROTOCOL_NAME, // 'C2PA-Manifest-Proof'
  PROTOCOL_VERSION, // '1.0.0'
  TAG_MANIFEST_ID, // 'C2PA-Manifest-ID'
  TAG_STORAGE_MODE, // 'C2PA-Storage-Mode'
  TAG_SOFT_BINDING_ALG, // 'C2PA-Soft-Binding-Alg'
  ALG_PHASH, // 'org.ar-io.phash'
  ALG_ISCC, // 'io.iscc.v0'
  type StorageMode, // 'full' | 'manifest' | 'proof'
  type Tag, // { name: string; value: string }
  type C2PATagSet, // Full typed tag set interface
} from '@ar-io/c2pa-protocol';
```

## Tag Schema

All ANS-104 tags for C2PA data items on Arweave:

| Constant                  | Tag Name                   | Required        |
| ------------------------- | -------------------------- | --------------- |
| `TAG_PROTOCOL`            | `Protocol`                 | All modes       |
| `TAG_PROTOCOL_VERSION`    | `Protocol-Version`         | All modes       |
| `TAG_MANIFEST_ID`         | `C2PA-Manifest-ID`         | All modes       |
| `TAG_STORAGE_MODE`        | `C2PA-Storage-Mode`        | All modes       |
| `TAG_ASSET_HASH`          | `C2PA-Asset-Hash`          | All modes       |
| `TAG_MANIFEST_STORE_HASH` | `C2PA-Manifest-Store-Hash` | All modes       |
| `TAG_MANIFEST_REPO_URL`   | `C2PA-Manifest-Repo-URL`   | All modes       |
| `TAG_ASSET_CONTENT_TYPE`  | `C2PA-Asset-Content-Type`  | Mode 2+3        |
| `TAG_MANIFEST_FETCH_URL`  | `C2PA-Manifest-Fetch-URL`  | Mode 2+3        |
| `TAG_SOFT_BINDING_ALG`    | `C2PA-Soft-Binding-Alg`    | When applicable |
| `TAG_SOFT_BINDING_VALUE`  | `C2PA-Soft-Binding-Value`  | When applicable |
| `TAG_CLAIM_GENERATOR`     | `C2PA-Claim-Generator`     | Optional        |
