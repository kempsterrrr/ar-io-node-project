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

The verify sidecar builds from the `packages/ar-io-verify` submodule:

```bash
docker compose -f docker-compose.local.yaml up verify-sidecar -d
```

## Contributing

To develop verify features locally and contribute upstream:

```bash
cd ar-io-verify
git remote -v                    # origin = ar-io/ar-io-verify, fork = your fork
git checkout -b feat/my-feature
# make changes, test locally
git push fork feat/my-feature    # push to your fork
gh pr create -R ar-io/ar-io-verify  # open PR upstream
```
