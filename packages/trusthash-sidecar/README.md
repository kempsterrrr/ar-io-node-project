# Trusthash Sidecar

A sidecar service for AR.IO gateways that provides C2PA (Content Credentials) manifest creation, permanent storage on Arweave via ArNS undernames, and perceptual hash (pHash) similarity search.

## Features

- **C2PA Manifest Creation** - Generate Content Credentials manifests with embedded thumbnails
- **Permanent Storage** - Store manifests on Arweave via ArNS undernames
- **Similarity Search** - 64-bit pHash-based image similarity search using Hamming distance
- **Provenance Verification** - Validate C2PA signatures and manifest integrity
- **Gateway Integration** - Receives webhooks from AR.IO gateway for automatic indexing

## Quick Start

### Prerequisites

- Bun 1.2+
- AR.IO Gateway running (creates `ar-io-network`)
- Arweave wallet with funds for uploads
- ArNS root name (for undername registration)

### Setup

1. Copy environment template:

   ```bash
   cp .env.example .env
   ```

2. Configure your `.env`:

   ```bash
   ARNS_ROOT_NAME=your-arns-name
   ARWEAVE_WALLET_FILE=./wallets/your-wallet.json
   ```

3. Place your Arweave wallet in `./wallets/`

4. Start the service:

   ```bash
   # Development
   bun run dev

   # Or with Docker
   docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
   ```

## API Endpoints

| Endpoint                  | Method | Access   | Description                         |
| ------------------------- | ------ | -------- | ----------------------------------- |
| `/health`                 | GET    | Public   | Health check and service status     |
| `/v1/upload`              | POST   | Public   | Upload image, create C2PA manifest  |
| `/v1/search-similar`      | GET    | Public   | Search for similar images by pHash  |
| `/v1/verify-authenticity` | GET    | Public   | Verify C2PA manifest signatures     |
| `/v1/thumbnail`           | GET    | Public   | Extract thumbnail from manifest     |
| `/webhook`                | POST   | Internal | Receive gateway index notifications |

> **Note**: The `/webhook` endpoint is only accessible from within the Docker network (e.g., from the AR.IO gateway). External requests to `/webhook` return 404.

## Gateway Configuration

To enable webhooks from the AR.IO gateway, add to `apps/gateway/.env`:

```bash
ANS104_INDEX_FILTER='{"tags":[{"name":"pHash"}]}'
WEBHOOK_INDEX_FILTER='{"tags":[{"name":"pHash"}]}'
WEBHOOK_TARGET_SERVERS="http://trusthash-sidecar:3003/webhook"
```

The gateway connects to the sidecar directly via the Docker network (`ar-io-network`), bypassing the nginx proxy. This ensures the webhook is only accessible from trusted internal services.

## Architecture

```
External (Internet)                    Docker Network (ar-io-network)
       |                                        |
       v                                        |
+-------------------+                           |
|  nginx proxy      |                           |
|  (port 3003)      |---------------------------+
|                   |     /health, /v1/*, /     |
|  Routes:          |            |              |
|  + /health        |            v              |
|  + /v1/*          |   +-------------------+   |
|  + /              |   |    trusthash      |   |
|  x /webhook       |   |  sidecar (:3003)  |   |
+-------------------+   |                   |   |
                        | (internal only)   |   |
                        +---------^---------+   |
                                  |             |
                        POST /webhook           |
                                  |             |
                        +---------+----------+  |
                        |   AR.IO Gateway    |  |
                        |   (core:4000)      |--+
                        +--------------------+
```

**Security Model**: The nginx reverse proxy exposes only public endpoints (health, API routes) while blocking direct access to `/webhook`. The AR.IO gateway communicates directly with the sidecar over the Docker network, ensuring webhook requests are authenticated by network isolation.

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for production
bun run build
```

## Testing

### Unit Tests

Run all unit and integration tests (no server required):

```bash
bun test
```

This runs 110+ tests covering:

- C2PA manifest creation and verification
- Embedded JUMBF manifest reading (with real C2PA fixture)
- pHash computation and similarity search
- Thumbnail generation
- ArNS undername management

### End-to-End Tests

Test the running server with real HTTP requests:

```bash
# Terminal 1: Start the sidecar
bun run dev

# Terminal 2: Run E2E tests
bun run test:e2e
```

E2E tests verify:

- Health and API endpoints
- Search functionality
- Upload flow (requires wallet for full test)
- Webhook processing
- Manifest verification

### Full Test Suite

Run both unit and E2E tests:

```bash
bun run test:all
```

### Test Fixtures

Real C2PA images are stored in `tests/fixtures/` for reliable offline testing:

- `c2pa-sample.jpg` - JPEG with embedded C2PA manifest from c2pa-rs project

### Testing with Real Uploads

For full end-to-end testing with Arweave uploads:

1. Create a funded Arweave wallet
2. Place it in `./wallets/your-wallet.json`
3. Configure `.env`:
   ```bash
   ARWEAVE_WALLET_FILE=./wallets/your-wallet.json
   ARNS_ROOT_NAME=your-arns-name  # Optional
   ```
4. Run: `DRY_RUN=false bun run test:e2e`

### Verifying Network Isolation

After deployment, verify the webhook is properly protected:

```bash
# Public endpoints should work
curl http://localhost:3003/health
curl http://localhost:3003/v1/search-similar?txId=test

# Webhook should return 404 externally
curl -X POST http://localhost:3003/webhook -d '{}'
# Expected: 404 Not Found

# Webhook works internally (from gateway container)
docker exec -it core curl -X POST http://trusthash-sidecar:3003/webhook \
  -H "Content-Type: application/json" \
  -d '{"tx_id":"test"}'
# Expected: 200 or appropriate response
```

## License

MIT
