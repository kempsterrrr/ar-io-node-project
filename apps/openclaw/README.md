# OpenClaw Agent Deployment

This directory contains the deployment configuration for running the OpenClaw agent on a dedicated server, separate from the AR.IO gateway.

## Architecture

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│ Server A: Gateway               │     │ Server B: OpenClaw Agent        │
│ Private: 10.0.0.2               │     │ Private: 10.0.0.3               │
│                                 │     │                                 │
│ ┌─────────────────────────────┐ │     │ ┌─────────────────────────────┐ │
│ │ ar-io-node (Docker)         │ │     │ │ OpenClaw Container          │ │
│ │  - core:4000                │←─HTTP─│ │  - openclaw + plugin        │ │
│ │  - envoy:3000               │ │     │ └─────────────────────────────┘ │
│ └─────────────────────────────┘ │     │              │                  │
│              ↑                  │     │              │ SSH              │
│              │ SSH              │     │              ↓                  │
│              └──────────────────│─────│──────────────┘                  │
│                                 │     │                                 │
│ Host: Docker, nginx             │     │ Host: Docker, nginx             │
└─────────────────────────────────┘     └─────────────────────────────────┘
         ↑                                        ↑
   ario.agenticway.io                    clawd.agenticway.io
```

**Connections:**

- HTTP: Agent calls Gateway API at `http://10.0.0.2:4000` (private network)
- SSH: Agent manages Gateway via SSH for ops (restart, logs, update)

## Prerequisites

1. **Hetzner Private Network**: Both servers must be on the same private network
2. **SSH Access**: Generate and configure SSH key for gateway access
3. **Docker & nginx**: Installed on the OpenClaw server

## Setup

### 1. Clone and Configure

```bash
ssh root@OPENCLAW_SERVER
git clone https://github.com/kempsterrrr/ar-io-node-project.git
cd ar-io-node-project/apps/openclaw

# Copy and edit environment file
cp .env.example .env
vim .env
```

**Permissions note:** The container runs as the `node` user (uid 1000). Ensure `openclaw.json` and `gateway_key` are owned by uid 1000 and `chmod 600`, or OpenClaw will fail to start with `EACCES`.

### 2. Set Up SSH Key for Gateway

```bash
# Generate key pair
ssh-keygen -t ed25519 -f gateway_key -N ""

# Copy public key to gateway server
ssh-copy-id -i gateway_key.pub root@10.0.0.2

# Test connection
ssh -i gateway_key root@10.0.0.2 "docker compose ps"
```

### 3. Deploy

```bash
docker compose up -d
```

### 4. Configure nginx (on host)

```nginx
# /etc/nginx/sites-available/clawd
server {
    listen 80;
    server_name clawd.agenticway.io;

    location / {
        proxy_pass http://127.0.0.1:18789;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
ln -s /etc/nginx/sites-available/clawd /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d clawd.agenticway.io
```

## Operations

### Update OpenClaw and Plugin

```bash
# Rebuild with latest versions from npm
docker compose build --no-cache

# Redeploy (volumes preserve state)
docker compose up -d

# Check logs
docker compose logs -f openclaw-gateway
```

### View Logs

```bash
docker compose logs -f openclaw-gateway
```

### Restart

```bash
docker compose restart
```

## Volumes

| Volume               | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `openclaw-workspace` | Agent workspace and artifacts                    |
| `openclaw-devices`   | Device pairing approvals (`~/.openclaw/devices`) |

The workspace is mounted at `/home/node/.openclaw/workspace/`.
The container entrypoint will ensure the devices directory is owned by uid 1000 on startup.

## Environment Variables

| Variable                    | Required | Description                |
| --------------------------- | -------- | -------------------------- |
| `ANTHROPIC_API_KEY`         | Yes      | Claude API key             |
| `OPENCLAW_GATEWAY_TOKEN`    | Yes      | UI authentication token    |
| `OPENCLAW_KEYRING_PASSWORD` | No       | Encrypted storage password |

## GitHub Actions Deployment

This directory is deployed automatically when changes are pushed to `main`. See `.github/workflows/deploy-openclaw.yml`.

Required GitHub Secrets:

- `OPENCLAW_HOST`: Public IP of OpenClaw server
- `OPENCLAW_USER`: SSH username (root)
- `OPENCLAW_SSH_KEY`: SSH key to access OpenClaw server
- `GATEWAY_SSH_KEY`: SSH key for agent to access gateway
- `ANTHROPIC_API_KEY`: Claude API key
- `OPENCLAW_GATEWAY_TOKEN`: UI auth token

## Available Tools

The AR.IO Gateway plugin provides:

### Gateway API Tools

- `gateway_info` - Get gateway status and info
- `gateway_fetch` - Fetch Arweave transactions
- `gateway_resolve` - Resolve ArNS names
- `gateway_search` - Search transactions

### Gateway SSH Tools

- `gateway_status` - Show docker compose ps
- `gateway_restart` - Restart containers
- `gateway_logs` - View container logs
- `gateway_update` - Pull and redeploy
- `gateway_ssh_execute` - Run arbitrary commands
