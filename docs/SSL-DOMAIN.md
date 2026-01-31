# SSL & Domain Configuration

## Production Domain

| URL                                   | Purpose                |
| ------------------------------------- | ---------------------- |
| https://ario.agenticway.io            | Gateway endpoint       |
| https://ario.agenticway.io/ar-io/info | Gateway info           |
| https://ardrive.ario.agenticway.io    | ArNS subdomain example |
| https://\*.ario.agenticway.io         | Any ArNS name          |
| https://clawd.agenticway.io           | OpenClaw sidecar       |

## DNS Configuration

**Provider:** Cloudflare (free tier)

| Type | Name     | Content           | Proxy    |
| ---- | -------- | ----------------- | -------- |
| A    | `ario`   | `138.199.227.142` | DNS only |
| A    | `*.ario` | `138.199.227.142` | DNS only |
| A    | `clawd`  | `138.199.227.142` | DNS only |

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

### Configuration Files

| File                                               | Purpose                    |
| -------------------------------------------------- | -------------------------- |
| `/etc/letsencrypt/cloudflare.ini`                  | Cloudflare API credentials |
| `/etc/letsencrypt/live/ario.agenticway.io/`        | Certificate files          |
| `/etc/letsencrypt/renewal/ario.agenticway.io.conf` | Renewal config             |

### Nginx Configuration

Located at: `/etc/nginx/sites-available/ario-agenticway`

#### OpenClaw (clawd.agenticway.io)

Add this server block for the OpenClaw sidecar:

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

**Note:** Update the SSL certificate to include `clawd.agenticway.io`:

```bash
certbot certonly --dns-cloudflare \
  -d ario.agenticway.io \
  -d '*.ario.agenticway.io' \
  -d clawd.agenticway.io
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
