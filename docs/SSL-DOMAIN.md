# SSL & Domain Configuration

## Production Domain

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

