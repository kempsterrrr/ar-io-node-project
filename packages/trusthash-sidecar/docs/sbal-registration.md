# SBAL Registration Draft (Trusthash Sidecar)

This document is the request-ready metadata package for adding the AR.IO SBR endpoint to an SBAL entry.

## Endpoint

- SBR base URL: `https://c2pa.ar-io.dev/v1`
- OpenAPI document: `packages/trusthash-sidecar/openapi/c2pa-sbr-1.1.0.yaml`
- Authentication: public (no OAuth2 in this milestone)

## Current Behavior Scope

- `GET /matches/byBinding`: implemented (exact tag lookup)
- `POST /matches/byBinding`: implemented (exact tag lookup)
- `POST /matches/byContent`: implemented for `org.ar-io.phash` (image-only, near-match)
- `POST /matches/byReference`: not implemented (`501`)
- `GET /manifests/{manifestId}`: redirect-first with fallback manifest-byte retrieval

## Proposed Algorithm Metadata (Current)

- Algorithm name: `org.ar-io.phash`
- Type: `fingerprint`
- Status: active
- Notes: custom AR.IO fingerprint algorithm; not yet registered in official C2PA algorithm list.

## SBAL Entry Update Snippet

```json
{
  "algorithmName": "org.ar-io.phash",
  "type": "fingerprint",
  "deprecated": false,
  "entryMetadata": {
    "description": "AR.IO perceptual hash fingerprint lookup",
    "contact": "support@ar.io",
    "informationalUrl": "https://github.com/ar-io/ar-io-node-project/tree/main/packages/trusthash-sidecar"
  },
  "softBindingResolutionApis": [
    "https://c2pa.ar-io.dev/v1"
  ]
}
```

## Divergence Disclosure (for Submission Notes)

- Partial conformance release: `byReference` intentionally deferred (`501`).
- `byContent` is implemented early for `org.ar-io.phash` despite gist Phase 2a guidance that allows `501`.
- Manifest route supports redirect-first behavior plus compatibility fallback.
