# AR.IO Node Project

A monorepo containing an AR.IO gateway wrapper and extensible sidecar packages. Runs locally with Docker Compose and auto-deploys to Hetzner via GitHub Actions.

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Bun](https://bun.sh/) (v1.2+)

### Local Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ar-io-node-project.git
cd ar-io-node-project

# Install dependencies
bun install

# Set up the gateway
cp apps/gateway/.env.example apps/gateway/.env

# Start gateway + sidecar locally (builds sidecar from source)
docker compose -f docker-compose.local.yaml up -d
```

Test the gateway:

```bash
curl -L http://localhost:3000/4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM
# Expected output: test
```

### Run Trusthash Sidecar (Optional)

If you only want the gateway:

```bash
cd apps/gateway
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
```

Or run both services together from the repo root:

```bash
docker compose -f docker-compose.local.yaml up -d
```

You can also use the helper script:

```bash
./scripts/up-gateway-sidecar.sh -d
```

Use the prebuilt sidecar image instead:

```bash
./scripts/up-gateway-sidecar.sh --prod -d
```

Note: `--prod` requires access to `ghcr.io` (or set `TRUSTHASH_SIDECAR_IMAGE`).

## Project Structure

```
ar-io-node-project/
├── apps/
│   └── gateway/              # AR.IO gateway wrapper
│       ├── docker-compose.yaml
│       ├── docker-compose.dev.yaml
│       ├── .env.example
│       └── wallets/
├── packages/                  # Sidecar extensions (add your own!)
├── docker-compose.local.yaml  # Local gateway + sidecar compose
├── .github/
│   └── workflows/
│       ├── deploy-gateway.yml
│       └── ci.yml
├── turbo.json
├── package.json
└── README.md
```

## Available Commands

Run from the project root:

```bash
# Development
bun run dev              # Start all services in dev mode
bun run build            # Build all packages
bun run lint             # Lint all packages
bun run format           # Format all files with Prettier
bun run format:check     # Check formatting

# Gateway-specific (from apps/gateway/)
bun run --filter @ar-io/gateway dev     # Start gateway in dev mode
bun run --filter @ar-io/gateway start   # Start gateway in production mode
bun run --filter @ar-io/gateway stop    # Stop gateway
bun run --filter @ar-io/gateway logs    # View gateway logs
```

## Deployment to Hetzner

### Initial Server Setup

1. **Provision a Hetzner server** (recommended: CX41 or higher)
   - 4+ CPU cores
   - 16GB+ RAM
   - 500GB+ SSD

2. **Install Docker on the server:**

   ```bash
   ssh root@YOUR_SERVER_IP
   curl -fsSL https://get.docker.com | sh
   ```

3. **Set up SSH key authentication** (if not already done)

### GitHub Configuration

Add the following **secrets** to your repository (Settings → Secrets and variables → Actions):

| Secret                | Description                            |
| --------------------- | -------------------------------------- |
| `HETZNER_HOST`        | Server IP address                      |
| `HETZNER_USER`        | SSH username (usually `root`)          |
| `HETZNER_SSH_KEY`     | Private SSH key for authentication     |
| `AR_IO_WALLET`        | Your Arweave wallet address            |
| `OBSERVER_WALLET`     | Observer hot wallet address            |
| `OBSERVER_WALLET_KEY` | Observer wallet keyfile (JSON content) |
| `GHCR_USERNAME`       | (Sidecar) GHCR username (if private)   |
| `GHCR_TOKEN`          | (Sidecar) GHCR token (read:packages)   |
| `GHCR_VISIBILITY_TOKEN` | (Sidecar) GHCR token (write:packages) to force public |

Add the following **variables** (Settings → Secrets and variables → Actions → Variables):

| Variable         | Description                 | Default       |
| ---------------- | --------------------------- | ------------- |
| `GRAPHQL_HOST`   | GraphQL endpoint            | `arweave.net` |
| `START_HEIGHT`   | Starting block for indexing | `0`           |
| `ARNS_ROOT_HOST` | Your domain name            | (empty)       |
| `RUN_OBSERVER`   | Enable observer             | `true`        |
| `LOG_LEVEL`      | Logging level               | `info`        |

> `GHCR_USERNAME` and `GHCR_TOKEN` are only required if the sidecar image is private.
> `GHCR_VISIBILITY_TOKEN` is only required if you want the workflow to enforce public visibility.

### Automatic Deployment

Once configured, the gateway automatically deploys when you push to `main`:

```bash
git add .
git commit -m "Update gateway configuration"
git push origin main
# GitHub Actions will deploy to Hetzner
```

You can also trigger a manual deployment from the Actions tab.

### Deploying Trusthash Sidecar Alongside Gateway

The gateway deploy workflow now deploys the sidecar alongside the gateway using the
`latest` image tag. This keeps production aligned with the most recent published sidecar image.

Manual production deployment (same Docker network):

```bash
docker compose \
  -f apps/gateway/docker-compose.yaml \
  -f packages/trusthash-sidecar/docker-compose.sidecar.yaml \
  up -d
```

The sidecar uses `.env.docker` for container settings, which defaults
`GATEWAY_URL` to `http://core:4000`. If you run the overlay from a different
working directory, set:

```bash
TRUSTHASH_SIDECAR_ENV_FILE=packages/trusthash-sidecar/.env.docker
TRUSTHASH_SIDECAR_DATA_DIR=packages/trusthash-sidecar/data
TRUSTHASH_SIDECAR_NGINX_CONF=packages/trusthash-sidecar/nginx.conf
```

Note: The sidecar overlay defaults its data directory to `./sidecar-data` to
avoid colliding with the gateway `./data` volume. Keep the data paths separate.

### Automated Sidecar Releases

Publishing is automatic. When changes land in `main` under `packages/trusthash-sidecar/**`,
the `Publish Trusthash Sidecar` workflow:

- Auto-increments the version tag (starting from `v0.1.0`, bumping patch each publish)
- Pushes both the versioned tag and `latest`
- Deploys the sidecar using `latest`

If the sidecar image is private, add these secrets in GitHub Actions:

- `GHCR_USERNAME`
- `GHCR_TOKEN` (a PAT with `read:packages` for pulls on the server)

To enforce public visibility, add:

- `GHCR_VISIBILITY_TOKEN` (a PAT with `write:packages`)

## Adding Sidecars

Sidecars are additional services that extend the gateway. To add a new sidecar:

1. **Create a new package:**

   ```bash
   mkdir -p packages/my-sidecar/src
   ```

2. **Add package.json:**

   ```json
   {
     "name": "@ar-io/my-sidecar",
     "version": "0.1.0",
     "private": true,
     "scripts": {
       "dev": "docker compose up",
       "build": "tsc",
       "docker:build": "docker build -t my-sidecar ."
     }
   }
   ```

3. **Create a Dockerfile** for containerization

4. **Connect to the gateway network** in your docker-compose.yaml:

   ```yaml
   services:
     my-sidecar:
       # ... your service config
       networks:
         - ar-io-network

   networks:
     ar-io-network:
       external: true
   ```

5. **Provide an overlay compose file** so operators can add the sidecar alongside the gateway

6. **Add a GHCR publishing workflow** (optional, for public distribution)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Hetzner Server                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                  Docker Compose                        │ │
│  │                                                        │ │
│  │  ┌─────────────┐    ┌─────────────┐                   │ │
│  │  │   Envoy     │───▶│    Core     │                   │ │
│  │  │   :4000     │    │   Gateway   │                   │ │
│  │  └─────────────┘    └─────────────┘                   │ │
│  │         │                  │                          │ │
│  │         │           ┌──────┴──────┐                   │ │
│  │         │           │             │                   │ │
│  │         │      ┌────▼────┐  ┌─────▼─────┐            │ │
│  │         │      │  Data   │  │  Wallets  │            │ │
│  │         │      │ Volume  │  │  Volume   │            │ │
│  │         │      └─────────┘  └───────────┘            │ │
│  │         │                                             │ │
│  │  ┌──────▼──────────────────────────────────────────┐ │ │
│  │  │              ar-io-network (bridge)              │ │ │
│  │  │                                                  │ │ │
│  │  │  ┌─────────────┐  ┌─────────────┐               │ │ │
│  │  │  │  Sidecar 1  │  │  Sidecar 2  │  ...          │ │ │
│  │  │  └─────────────┘  └─────────────┘               │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### Gateway won't start locally

```bash
# Check Docker is running
docker ps

# Check logs
cd apps/gateway
docker compose logs

# Verify .env file exists
cat .env
```

### Deployment fails

1. Check GitHub Actions logs for errors
2. Verify all secrets are configured correctly
3. Test SSH connection manually:
   ```bash
   ssh -i YOUR_KEY root@YOUR_SERVER_IP
   ```

### Slow sync

Set `START_HEIGHT` to a recent block number (e.g., `1400000`) for faster development sync. Full sync requires significant storage (500GB+).

## Testing

See [docs/TESTING.md](docs/TESTING.md) for the complete testing guide.

Quick test after starting the gateway:

```bash
cd apps/gateway
./scripts/test-gateway.sh
```

## Resources

- [AR.IO Gateway Documentation](https://docs.ar.io/build/run-a-gateway/quick-start)
- [AR.IO Node GitHub](https://github.com/ar-io/ar-io-node)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Bun Documentation](https://bun.sh/docs)

## License

MIT
