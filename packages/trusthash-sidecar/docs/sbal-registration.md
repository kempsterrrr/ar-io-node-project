# SBAL Registration Draft (Trusthash Sidecar)

This document is the request-ready metadata package for adding the AR.IO SBR endpoint to an SBAL entry.

## Status

- `org.ar-io.phash`: **Not yet registered** — PR ready, submit to `github.com/c2pa-org/softbinding-algorithm-list`
- `io.iscc.v0`: **Already registered** (identifier 3 in SBAL) — supported for byBinding lookup

**Priority**: HIGH — using an unregistered algorithm in soft binding assertions violates a SHALL-level requirement in the C2PA spec (SBR API Section 1.3).

## Endpoint

- SBR base URL: `https://c2pa.ar-io.dev/v1`
- OpenAPI document: `packages/trusthash-sidecar/openapi/c2pa-sbr-1.1.0.yaml`
- Authentication: public (no OAuth2 in this milestone)

## Current Behavior Scope

- `GET /matches/byBinding`: implemented (algorithm-agnostic exact tag lookup)
- `POST /matches/byBinding`: implemented (algorithm-agnostic exact tag lookup)
- `POST /matches/byContent`: implemented for `org.ar-io.phash` (image-only, near-match)
- `POST /matches/byReference`: implemented for image references (non-standard extension)
- `GET /manifests/{manifestId}`: redirect-first with fallback + proof-locator fetch-through
- `GET /services/supportedAlgorithms`: returns `org.ar-io.phash` and `io.iscc.v0`

## Proposed Algorithm Metadata (org.ar-io.phash)

- Algorithm name: `org.ar-io.phash`
- Type: `fingerprint`
- Status: active
- Notes: custom AR.IO perceptual hash fingerprint algorithm; not yet registered in official C2PA algorithm list.

## SBAL Entry Update Snippet

```json
{
  "algorithmName": "org.ar-io.phash",
  "type": "fingerprint",
  "deprecated": false,
  "entryMetadata": {
    "description": "AR.IO 64-bit perceptual hash (blockhash) fingerprint for image similarity",
    "contact": "support@ar.io",
    "informationalUrl": "https://github.com/ar-io/ar-io-node-project/tree/main/packages/trusthash-sidecar",
    "dateEntered": "2026-03-20"
  },
  "decodedMediaTypes": [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/tiff",
    "image/avif",
    "image/heif"
  ],
  "softBindingResolutionApis": ["https://c2pa.ar-io.dev/v1"]
}
```

## Divergence Disclosure (for Submission Notes)

- `byBinding` is algorithm-agnostic and supports any registered SBAL algorithm for exact value lookup.
- `byContent` is only supported for `org.ar-io.phash` (server-side computation).
- `byReference` is a non-standard extension not defined in the SBR API spec.
- Manifest route supports redirect-first behavior plus proof-locator fetch-through.
