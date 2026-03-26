# C2PA Support Matrix

This document describes what the Trusthash Sidecar supports today for C2PA-related repository and soft-binding workflows.

Scope note:

- This is a repository/SBR implementation with a COSE signing oracle.
- Manifest creation is handled by the client SDK (`@ardrive/turbo-c2pa`, separate repo).
- This is not a cryptographic validator.

## Summary

The current implementation provides:

- COSE signing oracle (`POST /v1/sign`, `GET /v1/cert`) — feature-gated
- manifest lookup and retrieval by `manifestId`
- soft-binding lookup by exact binding value (algorithm-agnostic)
- image-based lookup by uploaded content (`org.ar-io.phash`)
- image-reference lookup by remote URL (non-standard extension)
- support for `manifest-store` artifacts and `proof-locator` artifacts
- support for `org.ar-io.phash` and `io.iscc.v0` binding algorithms
- `Protocol: C2PA-Manifest-Proof` tag schema with `C2PA-Storage-Mode` discrimination

The current implementation does not provide:

- manifest creation (client SDK responsibility)
- signature validation
- certificate chain validation
- revocation / OCSP / CRL checking
- TSA trust validation
- full JUMBF parsing (active manifest extraction)
- OAuth2 authentication

### Known Limitation: CAWG Identity Assertion

The identity assertion flow (`cawg.identity`) is **built but disabled by default**. The sidecar has a `POST /v1/identity/sign` endpoint that verifies Ethereum wallet ownership and signs identity assertion payloads. The SDK wires up `CallbackCredentialHolder` + `IdentityAssertionBuilder` from c2pa-node.

**Blocked by c2pa-rs**: The c2pa-rs library (used by both c2pa-node and contentcredentials.org) panics at `identity_assertion/assertion.rs:158` with `not yet implemented: Handle summary report for failure case` when reading manifests containing identity assertions. This causes both programmatic validation and the verification portal to crash.

The identity code is opt-in via `includeIdentity: true` in the SDK or `--identity` flag in the demo script. It will work automatically once c2pa-rs ships identity assertion validation support.

## Supported Algorithms

| Algorithm       | byBinding | byContent | Notes                                                            |
| --------------- | --------- | --------- | ---------------------------------------------------------------- |
| org.ar-io.phash | Yes       | Yes       | Custom perceptual hash fingerprint (not yet registered in SBAL)  |
| io.iscc.v0      | Yes       | No        | Registered in C2PA SBAL; lookup-only, no server-side computation |

## Support Matrix

| Capability                              | Status          | Current behavior                                                                                                         |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Repository lookup by `manifestId`       | Implemented     | `GET /v1/manifests/{manifestId}` resolves redirect metadata first, then serves bytes locally or via proof fetch-through. |
| `manifest-store` artifact support       | Implemented     | Stores a primary manifest artifact and can serve `application/c2pa` bytes from the gateway/Arweave path.                 |
| `proof-locator` artifact support        | Implemented     | Stores remote manifest URL plus digest metadata and can fetch-through with digest verification.                          |
| Fetch-through cache for proof artifacts | Implemented     | In-memory TTL/LRU cache only; no durable persistence.                                                                    |
| Soft-binding lookup by value            | Implemented     | `GET/POST /v1/matches/byBinding` performs algorithm-agnostic exact-match lookup via GraphQL + local DB.                  |
| Content lookup by uploaded asset        | Partial         | `POST /v1/matches/byContent` is image-only and supports `org.ar-io.phash`.                                               |
| Reference lookup by remote asset URL    | Partial         | `POST /v1/matches/byReference` is image-only. **Non-standard extension** (not in SBR spec).                              |
| Supported algorithm discovery           | Implemented     | `GET /v1/services/supportedAlgorithms` returns `org.ar-io.phash` and `io.iscc.v0`.                                       |
| `returnActiveManifest=true`             | Not supported   | Returns 501. Requires JUMBF parsing which is not implemented.                                                            |
| OAuth2 client credentials               | Not implemented | Endpoints are public in the current release.                                                                             |
| SBAL / decentralized lookup contract    | Not implemented | No `describe`/smart-contract-backed lookup implementation.                                                               |
| COSE signing oracle                     | Implemented     | `POST /v1/sign` signs raw COSE payloads. `GET /v1/cert` serves X.509 chain. Feature-gated via `ENABLE_SIGNING`.          |
| Tag schema                              | Implemented     | Webhook processor requires `Protocol: C2PA-Manifest-Proof` and `C2PA-Storage-Mode` tags.                                 |
| Manifest creation                       | Not in scope    | Handled by client SDK (`@ardrive/turbo-c2pa`) using `c2pa-node`.                                                         |
| C2PA validation / trust decisions       | Not implemented | No signature, trust chain, revocation, or timestamp validation.                                                          |

## Spec Compliance (SBR API v2.2)

| Endpoint                               | Spec Status | Notes                                                                                               |
| -------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `GET /v1/matches/byBinding`            | Compliant   | Response follows `c2pa.softBindingQueryResult` schema. Algorithm-agnostic.                          |
| `POST /v1/matches/byBinding`           | Compliant   | Same lookup behavior. Accepts `maxResults` in body.                                                 |
| `POST /v1/matches/byContent`           | Compliant   | Image-only; 415 for unsupported types.                                                              |
| `POST /v1/matches/byReference`         | Extension   | **Not in SBR spec.** Documented as non-standard.                                                    |
| `GET /v1/manifests/{manifestId}`       | Compliant   | Correct `application/c2pa` content type. `returnActiveManifest` returns 501.                        |
| `GET /v1/services/supportedAlgorithms` | Compliant   | Returns `c2pa.softBindingAlgList` schema.                                                           |
| `POST /v1/sign`                        | Custom      | COSE signing oracle. Supports `?format=der`. Used by client SDK.                                    |
| `GET /v1/cert`                         | Custom      | X.509 certificate chain. Used by client SDK.                                                        |
| `POST /v1/identity/sign`               | Custom      | CAWG identity assertion signing. Verifies ETH wallet. **Disabled by default — blocked by c2pa-rs.** |

## Operational Constraints

The current sidecar depends on tagged metadata for indexing and lookup. It does not parse JUMBF to recover missing repository metadata.

Remote fetch behavior is hardened but still operationally constrained:

- HTTPS is required by default.
- localhost and private-network targets are blocked by default.
- remote fetches are bounded by timeout and maximum byte limits.
- proof fetch cache is memory-backed and non-durable.

## Recommended External Positioning

Use the following wording externally:

"The Trusthash Sidecar provides C2PA 2.3 Soft Binding Resolution support with algorithm-agnostic binding lookup (including `org.ar-io.phash` and `io.iscc.v0`), manifest retrieval with proof-locator fetch-through, image-based similarity search, and a COSE signing oracle for use with C2PA client SDKs. Manifest creation is handled by the client SDK; the sidecar does not cryptographically validate manifests."

## Tag Schema

## Tag Schema

Data items tagged with `Protocol: C2PA-Manifest-Proof`:

| Tag                        | Required        | Description                         |
| -------------------------- | --------------- | ----------------------------------- |
| `Protocol`                 | Yes             | `C2PA-Manifest-Proof`               |
| `Protocol-Version`         | Yes             | `1.0.0`                             |
| `Content-Type`             | Yes             | Payload MIME type                   |
| `C2PA-Manifest-ID`         | Yes             | Manifest URN                        |
| `C2PA-Storage-Mode`        | Yes             | `full`, `manifest`, or `proof`      |
| `C2PA-Asset-Hash`          | Yes             | base64url SHA-256 of original asset |
| `C2PA-Manifest-Store-Hash` | Yes             | base64url SHA-256 of manifest store |
| `C2PA-Manifest-Repo-URL`   | Yes             | SBR API base URL                    |
| `C2PA-Asset-Content-Type`  | Mode 2+3        | Original media MIME type            |
| `C2PA-Manifest-Fetch-URL`  | Mode 2+3        | URL to retrieve manifest bytes      |
| `C2PA-Soft-Binding-Alg`    | When applicable | Algorithm identifier                |
| `C2PA-Soft-Binding-Value`  | When applicable | Algorithm-specific value            |

Legacy tags (`Manifest-Type`, `C2PA-SoftBinding-*`, `pHash`) are no longer supported.
