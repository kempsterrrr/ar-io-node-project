# Trusthash Sidecar

Trusthash Sidecar is a companion service for AR.IO gateways that provides a C2PA manifest repository, the C2PA Soft Binding Resolution API, and pHash similarity search powered by DuckDB. It indexes manifests from gateway webhooks using tags only (no JUMBF parsing). It does not create, sign, or verify manifests.

## Features

- **Manifest Repository** - Serve `application/c2pa` manifest stores by manifest ID (URN)
- **Soft Binding Resolution API** - Resolve manifests by binding, content, or reference URL
- **Similarity Search** - 64-bit pHash nearest-neighbor search using Hamming distance
- **Gateway Integration** - Webhook-driven indexing based on gateway tags

## Quick Start

### Prerequisites

- Bun 1.2+
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
   bun run dev

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

> If you are not using the default gateway service name (`core`), update `GATEWAY_URL` in `.env.docker`.

## Tag Contract (Gateway Indexing)

The sidecar **only indexes transactions that include the required tag set**. It does not parse JUMBF to recover missing data.

Required tags:

- `Content-Type=application/c2pa`
- `Manifest-Type=sidecar`
- `C2PA-Manifest-Id` (URN, e.g. `urn:uuid:...`)
- `C2PA-SoftBinding-Alg` (one per binding)
- `C2PA-SoftBinding-Value` (one per binding, base64-encoded CBOR bstr)
- `pHash` (16-char hex or 64-bit binary string, used for similarity search)

Recommended tags:

- `Original-Content-Type` (e.g. `image/jpeg`)
- `App-Name` (stored as claim generator)
- `C2PA-SoftBinding-Scope` (optional, one per binding, JSON string or scalar)

The sidecar requires `C2PA-SoftBinding-Alg` and `C2PA-SoftBinding-Value` to have matching counts.

## Gateway Configuration

Configure the gateway to send webhooks for C2PA sidecar transactions:

```bash
WEBHOOK_INDEX_FILTER='{"tags":[{"name":"Content-Type","value":"application/c2pa"},{"name":"Manifest-Type","value":"sidecar"},{"name":"C2PA-Manifest-Id"},{"name":"C2PA-SoftBinding-Alg","value":"org.ar-io.phash"},{"name":"C2PA-SoftBinding-Value"},{"name":"pHash"}]}'
WEBHOOK_TARGET_SERVERS="http://trusthash-sidecar:3003/webhook"
```

If you also want the gateway to index these transactions for GraphQL queries:

```bash
ANS104_INDEX_FILTER='{"tags":[{"name":"Content-Type","value":"application/c2pa"},{"name":"Manifest-Type","value":"sidecar"}]}'
```

## API Endpoints

| Endpoint                        | Method   | Access   | Description                                |
| ------------------------------- | -------- | -------- | ------------------------------------------ |
| `/health`                       | GET      | Public   | Health check and service status            |
| `/v1/search-similar`            | GET      | Public   | pHash similarity search                    |
| `/v1/matches/byBinding`         | GET/POST | Public   | Resolve soft bindings by value             |
| `/v1/matches/byContent`         | POST     | Public   | Resolve soft bindings by content           |
| `/v1/matches/byReference`       | POST     | Public   | Resolve soft bindings by reference URL     |
| `/v1/manifests/:manifestId`     | GET      | Public   | Fetch C2PA manifest store                  |
| `/v1/services/supportedAlgorithms` | GET   | Public   | Supported soft binding algorithms          |
| `/webhook`                      | POST     | Internal | Receive gateway index notifications        |

> The `/webhook` endpoint is expected to be reachable only from the gateway network. External requests should be blocked at the proxy layer.

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

# By reference (POST)
curl -X POST http://localhost:3003/v1/matches/byReference \
  -H "Content-Type: application/json" \
  -d '{"referenceUrl":"https://example.com/image.jpg","assetLength":12345,"assetType":"image/jpeg"}'
```

## Manifest Repository (C2PA)

Fetch a manifest store by manifest ID (URN). The response content type is `application/c2pa`.

```bash
curl -o manifest.c2pa \
  "http://localhost:3003/v1/manifests/urn:uuid:YOUR-MANIFEST-ID"
```

## Similarity Search

Search for similar images by pHash:

```bash
curl "http://localhost:3003/v1/search-similar?phash=ffffffffffffffff&threshold=10&limit=10"
```

## Development

```bash
bun install
bun run dev
```

## Migrations

Run migrations after building the dist bundle:

```bash
bun run build && bun run migrate
```

## Testing

```bash
bun test
```

Run integration tests (requires sidecar + gateway running):

```bash
RUN_INTEGRATION=1 bun test
# or override the base URL
RUN_INTEGRATION=1 INTEGRATION_BASE_URL=http://localhost:3003 bun test
```

## Next Steps

1. Run migrations as a separate deploy step in production and back up `data/provenance.duckdb` beforehand.
2. Add integration tests for `/webhook`, `/v1/matches/*`, and `/v1/manifests/:manifestId`.
3. Consider allowlist/denylist controls for `/v1/matches/byReference` in production deployments.
