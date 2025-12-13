# AR.IO Gateway

This is the AR.IO Gateway wrapper for local development and production deployment on Hetzner.

## Quick Start (Local Development)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Bun](https://bun.sh/) (optional, for workspace commands)

### Running Locally

1. **Copy the environment template:**

   ```bash
   cp .env.example .env
   ```

2. **Start the gateway:**

   ```bash
   # From this directory
   docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up

   # Or from the project root
   bun run --filter @ar-io/gateway dev
   ```

3. **Test the gateway:**

   ```bash
   # Fetch a test transaction
   curl -L http://localhost:3000/4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM
   # Expected output: test
   ```

### Available Commands

```bash
# Start in development mode (foreground with logs)
bun run dev

# Start in development mode (detached)
bun run dev:detached

# Start in production mode
bun run start

# Stop the gateway
bun run stop

# View logs
bun run logs

# View only core service logs
bun run logs:core

# Pull latest images
bun run pull

# Restart the gateway
bun run restart

# Stop and remove volumes (clean slate)
bun run clean
```

## Configuration

All configuration is done via environment variables in the `.env` file. See `.env.example` for all available options.

### Required for Production

| Variable          | Description                                    |
| ----------------- | ---------------------------------------------- |
| `AR_IO_WALLET`    | Your Arweave wallet address (gateway operator) |
| `OBSERVER_WALLET` | Hot wallet address for observer reports        |
| `ARNS_ROOT_HOST`  | Your domain name (e.g., `gateway.example.com`) |

### Observer Wallet Setup

To run an observer (required for earning rewards):

1. Create a new Arweave wallet for the observer (do not use your main wallet)
2. Save the keyfile as `wallets/<OBSERVER_WALLET_ADDRESS>.json`
3. Set `OBSERVER_WALLET` to the wallet address in `.env`
4. Set `RUN_OBSERVER=true` in `.env`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Port 3000 (Envoy)                    │
│                         ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │                Envoy Proxy                       │   │
│  │   - Routes requests to core                      │   │
│  │   - Handles ArNS subdomain routing               │   │
│  └─────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │                 Core Service                     │   │
│  │   - Indexes Arweave data                        │   │
│  │   - Serves content                              │   │
│  │   - Runs observer (if enabled)                  │   │
│  └─────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Data Volume                         │   │
│  │   - SQLite databases                            │   │
│  │   - Chunk cache                                 │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Deployment

This gateway automatically deploys to Hetzner when changes are pushed to the `main` branch. See the [root README](../../README.md) for deployment documentation.

## Troubleshooting

### Gateway won't start

1. Check Docker is running: `docker ps`
2. Check logs: `docker compose logs`
3. Verify `.env` file exists and has required values

### Slow sync

The gateway needs to index Arweave data. For development:

- Set `START_HEIGHT` to a recent block (e.g., `1400000`)
- Full sync requires significant storage (500GB+)

### Observer errors

1. Verify wallet keyfile is in `wallets/` directory
2. Check wallet has enough AR or Turbo Credits for report uploads
3. View observer logs: `docker compose logs core | grep observer`

# Deployment trigger Sat 13 Dec 2025 15:20:03 GMT

# ARNS domain configured: Sat 13 Dec 2025 15:57:45 GMT
