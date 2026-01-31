# SSL & Domain Configuration

## Production Architecture

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│ Server A: Gateway               │     │ Server B: OpenClaw              │
│ Public:  138.199.227.142        │     │ Public:  OPENCLAW_IP            │
│ Private: 10.0.0.2               │     │ Private: 10.0.0.3               │
└─────────────────────────────────┘     └─────────────────────────────────┘
         ↑                                        ↑
   ario.agenticway.io                    clawd.agenticway.io
   *.ario.agenticway.io
```

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

Nginx config: `/etc/nginx/sites-available/ario-agenticway`

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

Create `/etc/nginx/sites-available/clawd`:

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

    ssl_certificate /etc/letsencrypt/live/clawd.agenticway.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clawd.agenticway.io/privkey.pem;
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

Enable the site:

```bash
ln -s /etc/nginx/sites-available/clawd /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## Private Network Configuration

OpenClaw connects to the gateway via Hetzner private networking.

### Gateway Server Firewall

Allow OpenClaw to access the gateway's internal API and SSH:

```bash
ssh root@138.199.227.142

# If using ufw
ufw allow from 10.0.0.0/16 to any port 4000  # Gateway API
ufw allow from 10.0.0.0/16 to any port 22    # SSH for agent ops
ufw status
```

### SSH Key Setup for Agent

The OpenClaw agent needs SSH access to the gateway for operations:

```bash
# On OpenClaw server, generate key pair
ssh-keygen -t ed25519 -f ~/openclaw/gateway_key -N ""

# Copy public key to gateway
ssh-copy-id -i ~/openclaw/gateway_key.pub root@10.0.0.2

# Test connection
ssh -i ~/openclaw/gateway_key root@10.0.0.2 "docker compose ps"
```

### Verify Connectivity

From the OpenClaw server:

```bash
# Test private network
ping 10.0.0.2

# Test gateway API
curl http://10.0.0.2:4000/ar-io/info
```

## Server Access

```bash
# SSH into server
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
