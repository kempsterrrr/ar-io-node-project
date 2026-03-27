# Trusthash Sidecar

Trusthash Sidecar is a companion service for AR.IO gateways that provides a C2PA manifest repository, COSE signing oracle, the C2PA Soft Binding Resolution API, and pHash similarity search powered by DuckDB. It indexes manifests from gateway webhooks using tags only (no JUMBF parsing).

Used together with the `@ar-io/turbo-c2pa` client SDK to sign images with C2PA Content Credentials and upload them to Arweave.

## Features

- **COSE Signing Oracle** - `POST /v1/sign` for remote C2PA manifest signing, `GET /v1/cert` for X.509 certificate chain
- **Identity Assertion Signing** - `POST /v1/identity/sign` for CAWG identity assertions with Ethereum wallet verification (experimental)
- **Manifest Repository** - Redirect-first retrieval, local fallback, and proof-locator fetch-through for `application/c2pa` bytes
- **Soft Binding Resolution API** - Resolve manifests by binding, content, and remote references
- **Similarity Search** - 64-bit pHash nearest-neighbor search using Hamming distance
- **Gateway Integration** - Webhook-driven indexing based on `Protocol: C2PA-Manifest-Proof` tags

## Quick Start

### Prerequisites

- Node.js 20+ and pnpm
- AR.IO Gateway running (creates `ar-io-network` if using Docker)

### Setup

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Set required environment values:

   ```bash
   GATEWAY_URL=http://localhost:3000
   ```

3. Start the service:

   ```bash
   # Development
   pnpm run dev

   # Or with Docker
   docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
   ```

> Note: Docker uses `.env.docker` for container settings (default `GATEWAY_URL=http://core:4000`).  
> Keep `.env` for local (non-Docker) development.

## Local Development (Monorepo)

From the repo root, you can run the gateway + sidecar together with a single compose file:

```bash
docker compose -f docker-compose.local.yaml up -d
```

## Deployment (Gateway Operators)

To run the sidecar alongside an AR.IO gateway, use the sidecar overlay compose file so both
services share the same `ar-io-network`.

```bash
# Prebuilt image (recommended for production)
docker compose \
  -f docker-compose.yaml \
  -f /path/to/packages/trusthash-sidecar/docker-compose.sidecar.yaml \
  up -d
```

### Automated Releases

Publishing is automatic. When changes land in `main` under `packages/trusthash-sidecar/**`,
the `Publish Trusthash Sidecar` workflow:

- Auto-increments the version tag (starting from `v0.1.0`, bumping patch each publish)
- Pushes both the versioned tag and `latest`
- Deploys the sidecar using `latest`

If the image is private, add `GHCR_USERNAME` and `GHCR_TOKEN` secrets so the server can pull the image.
To enforce public visibility, add `GHCR_VISIBILITY_TOKEN` (PAT with `write:packages`). If it is not set,
the workflow will only succeed if the package is already public.

If you run the overlay from a different working directory, set:

```bash
TRUSTHASH_SIDECAR_ENV_FILE=/path/to/trusthash-sidecar/.env.docker
TRUSTHASH_SIDECAR_DATA_DIR=/path/to/trusthash-sidecar/data
TRUSTHASH_SIDECAR_NGINX_CONF=/path/to/trusthash-sidecar/nginx.conf
```

Keep the sidecar data directory separate from the gateway `./data` volume to avoid collisions.

### Required Environment

- `GATEWAY_URL=http://core:4000` (set in `.env.docker` by default)

### Optional Environment

- `TRUSTHASH_SIDECAR_IMAGE` (defaults to `ghcr.io/ar-io/trusthash-sidecar:${TRUSTHASH_SIDECAR_TAG:-latest}`)
- `TRUSTHASH_SIDECAR_TAG` (optional override for the image tag; production deploy uses `latest` by default)
- `TRUSTHASH_SIDECAR_DATA_DIR` (defaults to `./sidecar-data` in the compose project dir for the overlay)
- `TRUSTHASH_SIDECAR_NGINX_CONF` (defaults to `./nginx.conf` in the compose project dir)
- `PROXY_PORT` (default `3003`)
- `MAX_IMAGE_SIZE_MB` (default `50`)
- `REFERENCE_FETCH_TIMEOUT_MS` (default `10000`)
- `REMOTE_MANIFEST_CACHE_TTL_MS` (default `300000`)
- `REMOTE_MANIFEST_CACHE_MAX_ENTRIES` (default `200`)
- `REMOTE_MANIFEST_MAX_BYTES` (default `26214400`)
- `ALLOW_INSECURE_REFERENCE_URL` (default `false`, only for local integration testing)
- `ENABLE_PROOF_LOCATOR_ARTIFACTS` (default `true`)
- `ENABLE_BY_REFERENCE` (default `true`)
- `ENABLE_ACTIVE_MANIFEST_EXTRACTION` (default `true`)

> If you are not using the default gateway service name (`core`), update `GATEWAY_URL` in `.env.docker`.

## Tag Contract (Gateway Indexing)

The sidecar **only indexes transactions that include the required tag set**. It does not parse JUMBF to recover missing data.

Required tags (`manifest-store` artifact):

- `Content-Type=application/c2pa`
- `Manifest-Type=sidecar`
- `C2PA-Manifest-Id` or `C2PA-Manifest-ID` (URN, e.g. `urn:uuid:...`)
- `C2PA-SoftBinding-Alg` or `C2PA-Soft-Binding-Alg` (one per binding)
- `C2PA-SoftBinding-Value` or `C2PA-Soft-Binding-Value` (one per binding, base64-encoded CBOR bstr)
- `pHash` (16-char hex or 64-bit binary string, used for similarity search)

Required tags (`proof-locator` artifact):

- `Manifest-Type=proof`
- `C2PA-Manifest-Id` or `C2PA-Manifest-ID`
- `C2PA-Manifest-Remote-URL`
- `C2PA-Manifest-Digest-Alg`
- `C2PA-Manifest-Digest-Value`
- `C2PA-SoftBinding-Alg` or `C2PA-Soft-Binding-Alg`
- `C2PA-SoftBinding-Value` or `C2PA-Soft-Binding-Value`

Recommended tags:

- `Original-Content-Type` (e.g. `image/jpeg`)
- `App-Name` (stored as claim generator)
- `C2PA-SoftBinding-Scope` or `C2PA-Soft-Binding-Scope` (optional, one per binding, JSON string or scalar)

The sidecar requires `C2PA-SoftBinding-Alg` and `C2PA-SoftBinding-Value` to have matching counts.

## Gateway Configuration

Configure the gateway to send webhooks for C2PA sidecar transactions:

```bash
WEBHOOK_INDEX_FILTER='{"tags":[{"name":"Content-Type","value":"application/c2pa"},{"name":"Manifest-Type","value":"sidecar"},{"name":"C2PA-Manifest-Id"},{"name":"C2PA-SoftBinding-Alg","value":"org.ar-io.phash"},{"name":"C2PA-SoftBinding-Value"},{"name":"pHash"}]}'
WEBHOOK_TARGET_SERVERS="http://trusthash-sidecar:3003/webhook"
```

> The sidecar accepts both `C2PA-SoftBinding-*` and `C2PA-Soft-Binding-*` naming families, and both `C2PA-Manifest-Id` and `C2PA-Manifest-ID`.

If you also want the gateway to index these transactions for GraphQL queries:

```bash
ANS104_INDEX_FILTER='{"tags":[{"name":"Content-Type","value":"application/c2pa"},{"name":"Manifest-Type","value":"sidecar"}]}'
```

## API Endpoints

| Endpoint                           | Method   | Access   | Description                                                    |
| ---------------------------------- | -------- | -------- | -------------------------------------------------------------- |
| `/health`                          | GET      | Public   | Health check and service status                                |
| `/v1/search-similar`               | GET      | Public   | pHash similarity search                                        |
| `/v1/matches/byBinding`            | GET/POST | Public   | Resolve by exact soft-binding tag match                        |
| `/v1/matches/byContent`            | POST     | Public   | Resolve by uploaded image (`org.ar-io.phash`)                  |
| `/v1/matches/byReference`          | POST     | Public   | Resolve by remote reference URL (`org.ar-io.phash`)            |
| `/v1/manifests/:manifestId`        | GET      | Public   | Redirect-first retrieval with fallback and proof fetch-through |
| `/v1/services/supportedAlgorithms` | GET      | Public   | Supported soft binding algorithms                              |
| `/webhook`                         | POST     | Internal | Receive gateway index notifications                            |

> The `/webhook` endpoint is expected to be reachable only from the gateway network. External requests should be blocked at the proxy layer.

OpenAPI contract for current SBR surface: `openapi/c2pa-sbr-1.1.0.yaml`.
Clear implementation snapshot: `docs/c2pa-support-matrix.md`.

## C2PA 2.3 Conformance (Partial)

| Area                                                                          | Status          | Notes                                                                                                   |
| ----------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `GET/POST /v1/matches/byBinding`                                              | Implemented     | Exact GraphQL tag lookup for both `C2PA-Soft-Binding-*` and `C2PA-SoftBinding-*` families.              |
| `POST /v1/matches/byContent`                                                  | Partial         | Image-only `org.ar-io.phash` extraction + near-match lookup; accepts `hintAlg`/`hintValue`.             |
| `POST /v1/matches/byReference`                                                | Partial         | Implemented for image references; computes `org.ar-io.phash` and runs match lookup.                     |
| `GET /v1/manifests/{manifestId}`                                              | Partial         | Redirect-first with local fallback and proof-locator fetch-through (digest-verified + ephemeral cache). |
| `GET /v1/services/supportedAlgorithms`                                        | Implemented     | Returns currently supported soft binding algorithms.                                                    |
| OAuth2 `clientCredentials` auth                                               | Not implemented | Endpoints are currently public.                                                                         |
| SBAL/decentralized lookup contract (`describe`, smart-contract-backed lookup) | Not implemented | Current lookup is HTTPS + GraphQL tag-index-backed.                                                     |

### Gist Alignment and Intentional Divergences

- Aligned with gist `0.3.0` by making `byBinding` exact-match GraphQL and `manifests` redirect-first.
- Intentional divergence: `byContent` remains implemented for `org.ar-io.phash` in this milestone instead of returning `501`.
- `byReference` is implemented for image references; OAuth2/SBAL contract work is still deferred.

## Soft Binding Resolution (C2PA)

Resolve manifests from soft binding values or content.

```bash
# By binding (GET)
curl "http://localhost:3003/v1/matches/byBinding?alg=org.ar-io.phash&value=BASE64&maxResults=10"

# By binding (POST)
curl -X POST http://localhost:3003/v1/matches/byBinding \
  -H "Content-Type: application/json" \
  -d '{"alg":"org.ar-io.phash","value":"BASE64"}'

# By content (POST)
curl -X POST http://localhost:3003/v1/matches/byContent?alg=org.ar-io.phash \
  -H "Content-Type: image/jpeg" \
  --data-binary "@image.jpg"

# By content with hint pair (POST)
curl -X POST "http://localhost:3003/v1/matches/byContent?hintAlg=org.ar-io.phash&hintValue=BASE64" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@image.jpg"

# By reference (POST)
curl -X POST http://localhost:3003/v1/matches/byReference \
  -H "Content-Type: application/json" \
  -d '{"referenceUrl":"https://example.com/image.jpg","assetLength":12345}'
```

## Manifest Repository (C2PA)

Fetch a manifest store by manifest ID (URN).

Resolution behavior:

- If `C2PA-Manifest-Fetch-URL` exists in indexed proof tags: `302` redirect to that URL.
- Else if `C2PA-Manifest-Repo-URL` exists: `302` redirect to `{repoUrl}/manifests/{manifestId}`.
- Else if artifact kind is `manifest-store`: fallback to local indexed record + gateway transaction fetch.
- Else if artifact kind is `proof-locator`: fetch remote manifest URL, verify digest, and return bytes (`proof-remote-fetch` / `proof-remote-cache`).

```bash
# inspect redirect-first behavior
curl -i "http://localhost:3003/v1/manifests/urn:uuid:YOUR-MANIFEST-ID"

# returnActiveManifest=true is supported when active extraction is enabled
curl "http://localhost:3003/v1/manifests/urn:uuid:YOUR-MANIFEST-ID?returnActiveManifest=true"
```

## Similarity Search

Search for similar images by pHash:

```bash
curl "http://localhost:3003/v1/search-similar?phash=ffffffffffffffff&threshold=10&limit=10"
```

## Development

```bash
pnpm install
pnpm run dev
```

## Migrations

Run migrations after building the dist bundle:

```bash
pnpm run build && pnpm run migrate
```

## Testing

```bash
pnpm test
```

Run integration tests locally (isolated test DB + gateway stub) from the repo root:

```bash
./scripts/run-trusthash-integration.sh
```

The integration script will:

1. Start the sidecar plus a local gateway stub.
2. Seed a dedicated test DB under `packages/trusthash-sidecar/data-test`.
3. Run the integration suite (`RUN_INTEGRATION=1`).
4. Tear down containers and delete the test DB (set `KEEP_INTEGRATION_DATA=1` or
   `KEEP_INTEGRATION_CONTAINERS=1` to keep them).

By default the `/v1/matches/byReference` test uses a local fixture served at
`http://gateway-stub/reference.png` and reads the local fixture file to compute
asset length. The integration compose enables
`ALLOW_INSECURE_REFERENCE_URL=true` so HTTP is only allowed for this local test.

## Next Steps

1. Run migrations as a separate deploy step in production and back up `data/provenance.duckdb` beforehand.
2. Add a manual or scheduled CI job to run `./scripts/run-trusthash-integration.sh`.
3. Consider allowlist/denylist controls for `/v1/matches/byReference` in production deployments.
