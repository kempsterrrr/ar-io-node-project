# Verify Sidecar — Deployment Config

This directory contains **deployment configuration only** for the ar.io Verify sidecar.

Source code lives in the official repository: https://github.com/ar-io/ar-io-verify

The full source is available as a git submodule at `ar-io-verify/` (repo root).

## Files

| File                         | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `docker-compose.verify.yaml` | Production compose overlay for gateway deploy |
| `.env.docker`                | Runtime environment variables                 |
| `nginx.conf`                 | Reverse proxy configuration                   |

## Local Development

The verify sidecar builds from the `ar-io-verify/` submodule (repo root):

```bash
docker compose -f docker-compose.local.yaml up -d
```

## Contributing

To develop verify features locally and contribute upstream:

```bash
cd ar-io-verify
git checkout -b feat/my-feature
# make changes, test locally
git push origin feat/my-feature
gh pr create -R ar-io/ar-io-verify
```
