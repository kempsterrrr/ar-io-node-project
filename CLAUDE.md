# AR.IO Node Project

Monorepo: Arweave gateway + sidecar services (C2PA provenance, payments, APIs).

**Canonical policy**: See [AGENTS.md](AGENTS.md) for all agentic operating standards.

## Quick Reference

**Stack**: Bun + Turborepo, Docker Compose, GitHub Actions, Hetzner

**Packages**: `apps/gateway/`, `packages/trusthash-sidecar/`, `packages/turbo-c2pa/`, `packages/c2pa-protocol/`, `packages/x402-bundler-sidecar/`

**Key commands**:

```bash
bun install                 # Install dependencies
bun run build              # Build all packages
bun run format             # Format code (ALWAYS before commit)
bun run format:check       # Check formatting
```

**Git**: Feature branches, conventional commits (`feat:`, `fix:`, `docs:`), PRs to `main`.

## Critical Gotchas

1. Branch protection ON - use PRs, never push to `main`
2. Gateway on port 3000 (Envoy proxy handles routing)
3. Run `bun run format` before every commit or CI fails
4. Gateway must start before sidecars (`ar-io-network`)
5. CodeRabbit reviews PRs - check comments before merge
6. Shared Hetzner server - use `docker image prune`, not `docker system prune`

## Boundaries - Do NOT Modify

- `apps/gateway/data/` - Gateway blockchain data
- `**/wallets/` - Wallet files (sensitive)
- `.env` files - Local config only (use .env.example)

## CI Checks

1. Lint & Format
2. Validate Docker
3. Build Check
4. Security Scan
5. Agentic Policy Validation

## Detailed Documentation

Full project docs, sidecar patterns, architecture, and conventions:

@docs/PROJECT.md
@docs/TESTING.md
