# Image Provenance Sidecar

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

| Endpoint                  | Method | Description                         |
| ------------------------- | ------ | ----------------------------------- |
| `/health`                 | GET    | Health check and service status     |
| `/v1/upload`              | POST   | Upload image, create C2PA manifest  |
| `/v1/search-similar`      | GET    | Search for similar images by pHash  |
| `/v1/verify-authenticity` | GET    | Verify C2PA manifest signatures     |
| `/v1/thumbnail`           | GET    | Extract thumbnail from manifest     |
| `/webhook`                | POST   | Receive gateway index notifications |

## Gateway Configuration

To enable webhooks from the AR.IO gateway, add to `apps/gateway/.env`:

```bash
ANS104_INDEX_FILTER='{"tags":[{"name":"pHash"}]}'
WEBHOOK_INDEX_FILTER='{"tags":[{"name":"pHash"}]}'
WEBHOOK_TARGET_SERVERS="http://image-provenance-sidecar:3003/webhook"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AR.IO GATEWAY                               │
│  Indexes pHash-tagged transactions → pushes webhooks            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /webhook
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              IMAGE PROVENANCE SIDECAR (port 3003)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Upload API  │  │ Search API  │  │ Verify API  │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌────────────────────────────────────────────────────────────┐│
│  │            DuckDB (embedded, persistent)                    ││
│  │            ./data/provenance.duckdb                         ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

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

## License

MIT
