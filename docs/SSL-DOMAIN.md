# SSL & Domain Configuration

## Production Architecture

```
┌─────────────────────────────────┐
│ Gateway Server                  │
│ Public: 138.199.227.142         │
└─────────────────────────────────┘
                ↑
      ario.agenticway.io
      *.ario.agenticway.io
```

## Production Domains

| URL                                   | Purpose                |
| ------------------------------------- | ---------------------- |
| https://ario.agenticway.io            | Gateway endpoint       |
| https://ario.agenticway.io/ar-io/info | Gateway info           |
| https://ardrive.ario.agenticway.io    | ArNS subdomain example |
| https://\*.ario.agenticway.io         | Any ArNS name          |

## DNS Configuration

**Provider:** Cloudflare (free tier)

| Type | Name     | Content           | Proxy    |
| ---- | -------- | ----------------- | -------- |
| A    | `ario`   | `138.199.227.142` | DNS only |
| A    | `*.ario` | `138.199.227.142` | DNS only |

**Important:** Keep proxy status as "DNS only" (gray cloud) for AR.IO gateways.

## SSL Certificates

**Provider:** Let's Encrypt via Certbot  
**Auto-renewal:** Enabled via Cloudflare DNS plugin

### Certificate Commands

```bash
# Check certificate status
certbot certificates

# Check certificate SANs (verify wildcard coverage)
openssl x509 -in /etc/letsencrypt/live/ario.agenticway.io/fullchain.pem -noout -text | grep -A1 "Subject Alternative Name"

# Issue/renew wildcard certificate (both base + wildcard required)
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d ario.agenticway.io \
  -d "*.ario.agenticway.io" \
  --cert-name ario.agenticway.io \
  --force-renewal

# Reload nginx after cert renewal
systemctl reload nginx

# Test renewal (dry run)
certbot renew --dry-run
```

> **Important:** The certificate must include both `ario.agenticway.io` AND
> `*.ario.agenticway.io` for ArNS subdomain routing to work. Without the
> wildcard SAN, browsers will reject TLS connections to ArNS subdomains with
> `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`.

### Gateway Server Configuration

| File                                               | Purpose                    |
| -------------------------------------------------- | -------------------------- |
| `/etc/letsencrypt/cloudflare.ini`                  | Cloudflare API credentials |
| `/etc/letsencrypt/live/ario.agenticway.io/`        | Certificate files          |
| `/etc/letsencrypt/renewal/ario.agenticway.io.conf` | Renewal config             |

Nginx config: `/etc/nginx/sites-available/ario-agenticway` (managed via `apps/gateway/nginx/`)

## Nginx as Code

Gateway nginx config is version-controlled in this repository:

| Server  | Source File                          | Deployed To                                  |
| ------- | ------------------------------------ | -------------------------------------------- |
| Gateway | `apps/gateway/nginx/ario-agenticway` | `/etc/nginx/sites-available/ario-agenticway` |

Config deployment workflow:

- `.github/workflows/deploy-gateway.yml`

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
