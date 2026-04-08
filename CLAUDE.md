# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Monorepo: Arweave gateway + sidecar services (C2PA provenance, verification, payments).

**Canonical policy**: See [AGENTS.md](AGENTS.md) for all agentic operating standards.

## Commands

```bash
# Root-level (runs across all packages via Turborepo)
pnpm install                 # Install dependencies
pnpm run build              # Build all packages (turbo)
pnpm run format             # Format code - ALWAYS run before commit
pnpm run format:check       # Check formatting (CI uses this)

# Per-package tests (vitest)
cd packages/trusthash-sidecar && pnpm test   # Trusthash sidecar tests
cd packages/turbo-c2pa && pnpm test           # C2PA SDK tests (37 tests)
cd packages/verify-sidecar && pnpm test       # Verify sidecar tests

# Run a single test file
cd packages/<package> && pnpm exec vitest run src/path/to/file.test.ts

# Integration tests (requires Docker)
./scripts/run-trusthash-integration.sh

# Gateway (Docker-based, no TS build)
cd apps/gateway && pnpm run dev:detached      # Start gateway
cd apps/gateway && pnpm run stop              # Stop gateway

# Local dev: gateway + trusthash sidecar together
docker compose -f docker-compose.local.yaml up -d
```

## Architecture

```
apps/gateway/          Docker wrapper for AR.IO gateway (Envoy -> Core -> SQLite, port 3000)
packages/
  c2pa-protocol/       Shared constants + types (ANS-104 tag schema) - no runtime deps
  turbo-c2pa/          C2PA client SDK: sign mode (new manifests) + store mode (preserve existing)
  trusthash-sidecar/   Hono server: COSE signing oracle, manifest repo, SBR API, similarity search (DuckDB)
  verify-sidecar/      Express server: PDF attestation, verification pipeline (SQLite)
    web/               React 19 + Vite frontend for verify UI (Tailwind CSS, served at /verify/)
```

**Dependency flow**: `c2pa-protocol` -> `turbo-c2pa` -> `trusthash-sidecar`. Build order matters (`turbo` handles via `dependsOn: ["^build"]`).

**Docker network**: All services connect via `ar-io-network` bridge. Gateway creates the network; sidecars declare it as `external: true`.

**Build tooling**: Sidecars use `tsup` (ESM output to `dist/`). The SDK (`turbo-c2pa`) has no bundler - consumed as TS source via workspace protocol.

## Critical Gotchas

1. **Branch protection ON** - use PRs, never push to `main`
2. **Gateway on port 3000** - Envoy proxy handles routing, not the Node process
3. **Run `pnpm run format` before every commit** or CI fails (Prettier: single quotes, semis, 100 char lines)
4. **Gateway must start before sidecars** - it creates the `ar-io-network` Docker network
5. **Turbo binary conflict** - `@ardrive/turbo-sdk` shadows turborepo's `turbo`; root scripts use the explicit `turbo` path from devDeps
6. **CodeRabbit reviews PRs** - check its comments before merge
7. **Shared Hetzner server** - use `docker image prune`, not `docker system prune`

## Boundaries - Do NOT Modify

- `apps/gateway/data/` - Gateway blockchain data
- `**/wallets/` - Wallet files (sensitive)
- `.env` files - Local config only (copy from `.env.example`)

## CI Checks (`.github/workflows/ci.yml`)

1. Lint & Format (`pnpm run format:check`)
2. Validate Docker (all compose files)
3. Build Check (`pnpm run build`)
4. Security Scan (Trivy - HIGH/CRITICAL)
5. Agentic Policy Validation (`agentic-policy.yml`)

## Git Conventions

Feature branches, conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`), PRs to `main`. CodeRabbit auto-reviews.

## Detailed Documentation

- [docs/PROJECT.md](docs/PROJECT.md) - Full project docs, sidecar patterns, deployment
- [docs/TESTING.md](docs/TESTING.md) - Testing procedures, integration tests, troubleshooting
