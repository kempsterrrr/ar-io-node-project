# AR.IO Gateway Plugin for OpenClaw

An OpenClaw plugin that provides tools for interacting with AR.IO gateways and Arweave, including SSH-based gateway management operations.

## Overview

This plugin extends OpenClaw with Arweave-specific capabilities:

- Query and retrieve data from Arweave transactions
- Resolve ArNS (Arweave Name System) names
- Search for content by tags or owners
- Get gateway status and information
- **SSH gateway management** - restart, view logs, update (when configured)

## Installation

```bash
# Install the plugin
npx openclaw plugins install @kempsterrrr/openclaw-ario-plugin

# Configure to use any public AR.IO gateway
npx openclaw config set plugins.entries.ario-gateway.config.gatewayUrl "https://arweave.net"

# Or use a specific gateway
npx openclaw config set plugins.entries.ario-gateway.config.gatewayUrl "https://ar-io.dev"

# Start OpenClaw
npx openclaw start
```

## Configuration

### Plugin Configuration

| Option       | Type   | Required | Default | Description                                      |
| ------------ | ------ | -------- | ------- | ------------------------------------------------ |
| `gatewayUrl` | string | Yes      | -       | URL of the AR.IO gateway API                     |
| `timeout`    | number | No       | 30000   | Request timeout in milliseconds                  |
| `ssh`        | object | No       | -       | SSH configuration for gateway management (below) |

### SSH Configuration (Optional)

Enable SSH tools for gateway management when running on a separate server:

| Option        | Type   | Required | Default | Description                   |
| ------------- | ------ | -------- | ------- | ----------------------------- |
| `ssh.host`    | string | Yes      | -       | Gateway server IP or hostname |
| `ssh.user`    | string | No       | root    | SSH username                  |
| `ssh.keyPath` | string | Yes      | -       | Path to SSH private key       |

### Example Configuration

```json
{
  "plugins": {
    "entries": {
      "ario-gateway": {
        "enabled": true,
        "config": {
          "gatewayUrl": "https://ario.agenticway.io",
          "timeout": 30000,
          "ssh": {
            "host": "138.199.227.142",
            "user": "root",
            "keyPath": "/home/node/.ssh/gateway_key"
          }
        }
      }
    }
  }
}
```

## Tools

### Gateway API Tools

| Tool              | Description                        |
| ----------------- | ---------------------------------- |
| `gateway_info`    | Get gateway status and information |
| `gateway_fetch`   | Fetch transaction data by ID       |
| `gateway_resolve` | Resolve ArNS names                 |
| `gateway_search`  | Search transactions by tags/owners |

### Gateway SSH Tools (when configured)

| Tool                  | Description                     |
| --------------------- | ------------------------------- |
| `gateway_status`      | Get Docker container status     |
| `gateway_restart`     | Restart gateway containers      |
| `gateway_logs`        | View container logs             |
| `gateway_update`      | Pull latest images and redeploy |
| `gateway_ssh_execute` | Execute arbitrary SSH commands  |

## Tool Details

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

### gateway_status

Get Docker container status on the gateway server.

**Parameters:** None

**Example prompt:** "Show gateway status"

### gateway_restart

Restart gateway Docker containers.

**Parameters:**

- `service` (string, optional): Specific service to restart (e.g., "core", "envoy")

**Example prompt:** "Restart the gateway" or "Restart the core service"

### gateway_logs

View recent logs from gateway containers.

**Parameters:**

- `service` (string, optional): Specific service to get logs from
- `lines` (number, optional): Number of log lines (default: 50)

**Example prompt:** "Show gateway logs" or "Show last 100 core logs"

### gateway_update

Update the gateway by pulling latest Docker images and redeploying.

**Parameters:** None

**Example prompt:** "Update the gateway to the latest version"

## Deployment

For production deployment, see [apps/openclaw/README.md](../../apps/openclaw/README.md).

The plugin is designed to be installed from npm. Deployment infrastructure (Dockerfile, docker-compose, etc.) is in the `apps/openclaw/` directory.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Watch mode
npm run dev
```

### Local Development Setup

```bash
# Install OpenClaw
npx openclaw@latest

# Start gateway
cd apps/gateway && docker compose up -d

# Build and install plugin
cd packages/openclaw-ario-plugin
npm install && npm run build
npx openclaw plugins install .

# Configure plugin
npx openclaw config set plugins.entries.ario-gateway.config.gatewayUrl "http://localhost:3000"

# Start OpenClaw
npx openclaw start
```

### Running Integration Tests

```bash
npm run test:integration
npm run test:integration:down
```

## File Structure

```text
openclaw-ario-plugin/
├── openclaw.plugin.json  # Plugin manifest
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript config
├── src/
│   ├── index.ts          # Plugin entry point
│   ├── gateway/
│   │   └── client.ts     # AR.IO gateway HTTP client
│   ├── tools/
│   │   ├── index.ts      # Gateway API tool registration
│   │   └── ssh.ts        # SSH tool registration
│   └── types/
│       └── index.ts      # Gateway types
└── README.md
```

## License

MIT
