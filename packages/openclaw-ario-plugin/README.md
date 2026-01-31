# AR.IO Gateway Plugin for OpenClaw

An OpenClaw plugin that provides tools for interacting with AR.IO gateways and Arweave.

## Overview

This plugin extends OpenClaw with Arweave-specific capabilities:

- Query and retrieve data from Arweave transactions
- Resolve ArNS (Arweave Name System) names
- Search for content by tags or owners
- Get gateway status and information

## Installation

### Option A: npm Package (Recommended)

Install the plugin into an existing OpenClaw installation:

```bash
# Install the plugin
bunx openclaw plugins install @kempsterrrr/openclaw-ario-plugin

# Configure to use any public AR.IO gateway
bunx openclaw config set plugins.entries.ario-gateway.config.gatewayUrl "https://arweave.net"

# Or use a specific gateway
bunx openclaw config set plugins.entries.ario-gateway.config.gatewayUrl "https://ar-io.dev"

# Start OpenClaw
bunx openclaw start
```

### Option B: Docker Sidecar (AR.IO Gateway Operators)

Run OpenClaw as a sidecar alongside your AR.IO gateway:

```bash
# 1. Start the gateway first
cd apps/gateway && docker compose up -d

# 2. Configure environment
cd packages/openclaw-ario-plugin
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Build and start OpenClaw sidecar
docker compose up -d --build

# 4. (Optional) Setup messaging channels
docker compose run --rm openclaw-cli channels login  # WhatsApp QR
docker compose run --rm openclaw-cli channels add --channel telegram --token "<token>"
```

Access UI at http://localhost:18789

The plugin is pre-configured to connect to the gateway at `http://core:4000` (internal Docker network).

### Option C: Local Development

```bash
# Install OpenClaw
bunx openclaw@latest

# Start gateway
cd apps/gateway && docker compose up -d

# Build and install plugin
cd packages/openclaw-ario-plugin
bun install && bun run build
bunx openclaw plugins install .

# Configure plugin
bunx openclaw config set plugins.entries.ario-gateway.config.gatewayUrl "http://localhost:3000"

# Start OpenClaw
bunx openclaw start
```

## Configuration

### Plugin Configuration

| Option       | Type   | Required | Default | Description                     |
| ------------ | ------ | -------- | ------- | ------------------------------- |
| `gatewayUrl` | string | Yes      | -       | URL of the AR.IO gateway        |
| `timeout`    | number | No       | 30000   | Request timeout in milliseconds |

The Docker sidecar pre-configures these in `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "ario-gateway": {
        "enabled": true,
        "config": {
          "gatewayUrl": "http://core:4000",
          "timeout": 30000
        }
      }
    }
  }
}
```

### Environment Variables

| Variable                 | Description                     | Required |
| ------------------------ | ------------------------------- | -------- |
| `ANTHROPIC_API_KEY`      | Claude API key                  | Yes      |
| `OPENCLAW_GATEWAY_TOKEN` | OpenClaw auth token             | No       |
| `OPENCLAW_PORT`          | Gateway UI port (default 18789) | No       |

## Tools

The plugin registers the following tools with OpenClaw:

| Tool              | Description                        |
| ----------------- | ---------------------------------- |
| `gateway_info`    | Get gateway status and information |
| `gateway_fetch`   | Fetch transaction data by ID       |
| `gateway_resolve` | Resolve ArNS names                 |
| `gateway_search`  | Search transactions by tags/owners |

### gateway_info

Get information about the connected AR.IO gateway.

**Parameters:** None

**Example prompt:** "Get gateway info"

### gateway_fetch

Fetch a transaction from Arweave by its transaction ID.

**Parameters:**

- `txId` (string, required): The Arweave transaction ID
- `includeData` (boolean, optional): Whether to fetch transaction data content

**Example prompt:** "What is stored at transaction abc123...?"

### gateway_resolve

Resolve an ArNS name to its transaction ID.

**Parameters:**

- `name` (string, required): The ArNS name to resolve

**Example prompt:** "Resolve the ArNS name 'ardrive'"

### gateway_search

Search for Arweave transactions by tags or owner addresses.

**Parameters:**

- `tags` (array, optional): Tag filters with name and values
- `owners` (array, optional): Wallet addresses to filter by
- `limit` (number, optional): Maximum results (default: 10)

**Example prompt:** "Search for transactions with App-Name ArDrive"

## Architecture

### Production Deployment

```
clawd.agenticway.io (HTTPS)
        ↓
Production nginx (Hetzner server)
        ↓
localhost:18789
        ↓
openclaw-proxy (nginx:alpine in Docker)
        ↓
openclaw:18789 (internal)
```

### File Structure

```
openclaw-ario-plugin/
├── Dockerfile            # Builds OpenClaw with plugin pre-installed
├── docker-compose.yaml   # Sidecar deployment config
├── nginx.conf            # Nginx reverse proxy config
├── openclaw.json         # OpenClaw configuration
├── openclaw.plugin.json  # Plugin manifest
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript config
├── src/
│   ├── index.ts          # Plugin entry point
│   ├── gateway/
│   │   └── client.ts     # AR.IO gateway HTTP client
│   ├── tools/
│   │   └── index.ts      # OpenClaw tool registration
│   └── types/
│       └── index.ts      # Gateway types
└── README.md
```

### Docker Network

When running as a sidecar, OpenClaw joins the `ar-io-network` and can access:

- `core:4000` - AR.IO gateway internal API
- `envoy:3000` - AR.IO gateway public proxy

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Type check
bun run typecheck

# Watch mode
bun run dev
```

## Production Deployment (clawd.agenticway.io)

This section documents the manual steps required to deploy OpenClaw to production.

### Prerequisites

- SSH access to the Hetzner server (`ssh root@138.199.227.142`)
- Cloudflare DNS access for `agenticway.io`
- The AR.IO gateway must be running

### Step 1: DNS Configuration (Cloudflare)

Add an A record for the `clawd` subdomain:

| Type | Name    | Content           | Proxy    |
| ---- | ------- | ----------------- | -------- |
| A    | `clawd` | `138.199.227.142` | DNS only |

### Step 2: SSL Certificate (Hetzner Server)

SSH into the server and update the certificate to include the new subdomain:

```bash
ssh root@138.199.227.142

# Update certificate to include clawd subdomain
certbot certonly --dns-cloudflare \
  -d ario.agenticway.io \
  -d '*.ario.agenticway.io' \
  -d clawd.agenticway.io
```

### Step 3: Nginx Configuration (Hetzner Server)

Add the following server block to `/etc/nginx/sites-available/ario-agenticway`:

```nginx
# clawd.agenticway.io → OpenClaw
server {
    listen 80;
    server_name clawd.agenticway.io;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name clawd.agenticway.io;

    ssl_certificate /etc/letsencrypt/live/ario.agenticway.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ario.agenticway.io/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://localhost:18789;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Test and reload nginx:

```bash
nginx -t && systemctl reload nginx
```

### Step 4: Deploy OpenClaw Sidecar

```bash
cd ~/ar-io-node/packages/openclaw-ario-plugin

# Pull latest changes
git pull

# Start the sidecar
docker compose up -d --build
```

### Step 5: Verify Deployment

```bash
# Check containers are healthy
docker compose ps

# Test health endpoint
curl https://clawd.agenticway.io/health

# Check SSL certificate
curl -vI https://clawd.agenticway.io 2>&1 | grep -A2 "SSL certificate"
```

## Troubleshooting

### Cannot connect to gateway

Ensure the gateway is running and the `ar-io-network` exists:

```bash
docker network ls | grep ar-io-network
docker compose -f apps/gateway/docker-compose.yaml ps
```

### Plugin not loading

Check OpenClaw logs:

```bash
docker compose logs openclaw
```

Verify the plugin is recognized:

```bash
docker compose run --rm openclaw-cli plugins list
```

## License

MIT
