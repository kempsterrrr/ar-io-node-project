# SSL & Domain Configuration

## Production Architecture

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│ Server A: Gateway               │     │ Server B: OpenClaw              │
│ Public:  138.199.227.142        │     │ Public:  OPENCLAW_IP            │
└─────────────────────────────────┘     └─────────────────────────────────┘
         ↑                                        ↑
   ario.agenticway.io                    clawd.agenticway.io
   *.ario.agenticway.io                  (basic auth protected)
```

**Connections:**

- HTTPS: OpenClaw → Gateway API at `https://ario.agenticway.io`
- SSH: OpenClaw → Gateway server at public IP for ops (restart, logs, update)

## Production Domain

| URL                                   | Server   | Purpose                |
| ------------------------------------- | -------- | ---------------------- |
| https://ario.agenticway.io            | Gateway  | Gateway endpoint       |
| https://ario.agenticway.io/ar-io/info | Gateway  | Gateway info           |
| https://ardrive.ario.agenticway.io    | Gateway  | ArNS subdomain example |
| https://\*.ario.agenticway.io         | Gateway  | Any ArNS name          |
| https://clawd.agenticway.io           | OpenClaw | OpenClaw UI            |

## DNS Configuration

**Provider:** Cloudflare (free tier)

| Type | Name     | Content           | Proxy    | Server   |
| ---- | -------- | ----------------- | -------- | -------- |
| A    | `ario`   | `138.199.227.142` | DNS only | Gateway  |
| A    | `*.ario` | `138.199.227.142` | DNS only | Gateway  |
| A    | `clawd`  | `OPENCLAW_IP`     | DNS only | OpenClaw |

**Important:** Keep proxy status as "DNS only" (gray cloud) for AR.IO gateways.

## SSL Certificates

**Provider:** Let's Encrypt via Certbot

**Auto-renewal:** Enabled via Cloudflare DNS plugin

### Certificate Details

```bash
# Check certificate status
certbot certificates

# Test renewal (dry run)
certbot renew --dry-run

# Force renewal
certbot renew --force-renewal
```

### Gateway Server Configuration

| File                                               | Purpose                    |
| -------------------------------------------------- | -------------------------- |
| `/etc/letsencrypt/cloudflare.ini`                  | Cloudflare API credentials |
| `/etc/letsencrypt/live/ario.agenticway.io/`        | Certificate files          |
| `/etc/letsencrypt/renewal/ario.agenticway.io.conf` | Renewal config             |

Nginx config: `/etc/nginx/sites-available/ario-agenticway` (managed via `apps/gateway/nginx/`)

### OpenClaw Server Configuration

OpenClaw runs on a separate server with its own SSL certificate.

#### Setup Cloudflare Credentials

```bash
ssh root@OPENCLAW_IP

cat > /etc/letsencrypt/cloudflare.ini << 'EOF'
dns_cloudflare_api_token = YOUR_TOKEN
EOF
chmod 600 /etc/letsencrypt/cloudflare.ini
```

#### Get SSL Certificate

```bash
certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d clawd.agenticway.io
```

#### Nginx Configuration

Nginx config: `/etc/nginx/sites-available/clawd` (managed via `apps/openclaw/nginx/`)

The config includes basic auth protection - credentials stored in `/etc/nginx/.htpasswd`.

## Nginx as Code

Both server nginx configs are version-controlled in this repository:

| Server   | Source File                          | Deployed To                                  |
| -------- | ------------------------------------ | -------------------------------------------- |
| Gateway  | `apps/gateway/nginx/ario-agenticway` | `/etc/nginx/sites-available/ario-agenticway` |
| OpenClaw | `apps/openclaw/nginx/clawd`          | `/etc/nginx/sites-available/clawd`           |

Configs are automatically deployed via GitHub Actions workflows:

- Gateway: `.github/workflows/deploy-gateway.yml`
- OpenClaw: `.github/workflows/deploy-openclaw.yml`

## One-Time Server Setup

### Gateway Server (SSH firewall)

Allow SSH from anywhere (required for OpenClaw to SSH via public IP):

```bash
ssh root@138.199.227.142

# Allow SSH (key-based auth only)
ufw allow 22/tcp
ufw status
```

### OpenClaw Server (basic auth)

Create basic auth password file:

```bash
ssh root@OPENCLAW_IP

# Install htpasswd
apt install -y apache2-utils

# Create password file
htpasswd -c /etc/nginx/.htpasswd admin
# Enter password when prompted
```

### SSH Key Setup for Agent

The OpenClaw agent needs SSH access to the gateway for operations:

```bash
# On OpenClaw server, generate key pair
ssh-keygen -t ed25519 -f ~/openclaw/gateway_key -N ""

# Copy public key to gateway
ssh-copy-id -i ~/openclaw/gateway_key.pub root@138.199.227.142

# Test connection
ssh -i ~/openclaw/gateway_key root@138.199.227.142 "docker compose ps"
```

## Server Access

```bash
# SSH into gateway server
ssh root@138.199.227.142

# Or use the deploy key
ssh -i ~/.ssh/ar-io-deploy root@138.199.227.142
```

## Troubleshooting

### Check nginx status

```bash
systemctl status nginx
nginx -t
```

### Check certbot renewal

```bash
systemctl list-timers | grep certbot
certbot renew --dry-run
```

### Check gateway containers

```bash
cd ~/ar-io-gateway
docker compose ps
docker compose logs -f
```

### Reload nginx after cert renewal

```bash
systemctl reload nginx
```

## References

- [AR.IO SSL Docs](https://docs.ar.io/build/run-a-gateway/manage/ssl-certs)
- [Cloudflare DNS API](https://developers.cloudflare.com/api/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
