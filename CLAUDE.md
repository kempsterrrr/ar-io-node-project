# AR.IO Node Project

## Project Vision

A monorepo for running an AR.IO Arweave gateway and building custom sidecar services. The gateway handles Arweave data, and sidecars extend functionality (payments, content processing, APIs, etc.).

**Current state**: Gateway configuration + x402 bundler sidecar
**Future state**: Multiple custom-built full-stack sidecars (frontend, backend, database)

## Architecture

```
ar-io-node-project/
├── apps/gateway/           # AR.IO gateway (Docker-based, port 3000)
├── packages/               # Sidecar extensions
│   └── x402-bundler-sidecar/   # x402 payment bundler
├── docs/                   # Detailed documentation
└── .github/workflows/      # CI/CD pipelines
```

**Production**: https://ario.agenticway.io (ArNS: `*.ario.agenticway.io`)

**Stack**: Bun + Turborepo, Docker Compose, GitHub Actions → Hetzner

### Docker Network

All services connect via `ar-io-network` bridge network:

- Gateway creates the network on startup
- Sidecars must use `networks: ar-io-network: external: true`
- Gateway exposes port 3000, sidecars use internal ports

## Sidecar Development Patterns

### Package Structure

New sidecars should follow this structure:

```
packages/my-sidecar/
├── src/                    # TypeScript source code
│   ├── index.ts           # Entry point
│   ├── routes/            # API routes (if backend)
│   ├── services/          # Business logic
│   ├── db/                # Database schemas/migrations
│   └── types/             # TypeScript types
├── tests/                  # Test files
├── Dockerfile             # Container definition
├── docker-compose.yaml    # Production config
├── docker-compose.dev.yaml # Dev overrides
├── package.json           # Package config (@ar-io/sidecar-name)
├── tsconfig.json          # TypeScript config (extend root)
└── README.md              # Sidecar documentation
```

### Backend Patterns

- Use Express or Hono for APIs
- Health endpoint at `GET /health`
- Version prefix for APIs: `/v1/...`
- Return JSON for all responses
- Use environment variables for configuration
- Connect to gateway via `ar-io-network`

### Frontend Patterns

- Use React or Vue with Vite
- TypeScript for all components
- Tailwind CSS for styling
- Component-based architecture
- API client in separate module

### Database Patterns

- Use PostgreSQL for relational data (via Docker)
- Use SQLite for simple local storage
- Knex.js or Drizzle for migrations
- Keep migrations in `src/db/migrations/`
- Never commit database files

### Testing Requirements

- Unit tests for business logic
- Integration tests for APIs
- Test files next to source or in `tests/`
- Use Vitest or Jest
- Minimum coverage for critical paths

## Key Commands

### Development

```bash
bun install                 # Install dependencies
bun run build              # Build all packages
bun run format             # Format code (ALWAYS before commit)
bun run format:check       # Check formatting
```

### Gateway Operations

```bash
# From apps/gateway/
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml down
docker compose logs -f
./scripts/test-gateway.sh
```

### Testing Gateway

```bash
curl -s http://localhost:3000/ar-io/info | jq .
curl -sL http://localhost:3000/4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM
# Expected: "test"
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feat/my-feature

# Before committing
bun run format

# Commit with conventional message
git commit -m "feat: description"

# Create PR
gh pr create --title "feat: ..." --body "..."

# Monitor CI
gh pr checks <NUMBER>
gh pr view <NUMBER> --comments   # CodeRabbit feedback

# Merge (after approval)
gh pr merge <NUMBER> --squash --delete-branch

# Update local
git checkout main && git pull
git fetch --prune
```

## Code Conventions

### TypeScript

- Target: ES2022, Module: ESNext
- Strict mode enabled
- Use type annotations for function signatures
- Prefer interfaces over types for objects

### Formatting (Prettier)

- Semicolons: required
- Quotes: single
- Indentation: 2 spaces
- Line length: 100 characters
- Trailing commas: ES5

### Commits

Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`

## Critical Gotchas

1. **Branch protection ON** - Cannot push to `main`, use PRs
2. **Gateway on port 3000** - Not 4000, Envoy proxy handles routing
3. **Format before commit** - Run `bun run format` or CI fails
4. **Gateway before sidecars** - Gateway creates `ar-io-network`
5. **CodeRabbit reviews PRs** - Check comments before merge
6. **Shared Hetzner server** - Use `docker image prune`, not `docker system prune`

## CI Pipeline

All PRs must pass:

1. **Lint & Format** - Code style
2. **Validate Docker** - docker-compose syntax
3. **Build Check** - TypeScript compilation
4. **Security Scan** - Trivy vulnerability scan

## Deployment

Automatic deployment to Hetzner on push to `main`:

- SSH into server
- Clean unused Docker images
- Pull latest code
- Restart Docker Compose services

See `docs/SSL-DOMAIN.md` for SSL/domain setup.

## Boundaries - Do NOT Modify

- `apps/gateway/data/` - Gateway blockchain data (gitignored)
- `**/wallets/` - Wallet files (sensitive, gitignored)
- `.env` files - Local configuration (use .env.example as template)

## Serena Memories

Detailed project knowledge is stored in Serena memories. These provide deeper context than this file:

| Memory                       | Purpose                                           |
| ---------------------------- | ------------------------------------------------- |
| `platform_architecture`      | Sidecar registry, port allocation, API patterns   |
| `suggested_commands`         | Comprehensive command reference with all options  |
| `pr_workflow`                | Detailed PR collaboration workflow                |
| `x402_bundler_sidecar`       | Bundler-specific implementation notes and gotchas |
| `task_completion_checklist`  | Pre-PR verification checklist                     |
| `testing_procedures`         | Testing and troubleshooting procedures            |
| `deployment_information`     | Detailed deployment and server access guide       |
| `memory_management_strategy` | Guidelines for maintaining memories               |

**Note**: Do not duplicate memory content in CLAUDE.md. Reference memories for detailed information.

## Resources

- [AR.IO Gateway Docs](https://docs.ar.io/build/run-a-gateway/quick-start)
- [AR.IO Node GitHub](https://github.com/ar-io/ar-io-node)
- [Turborepo Docs](https://turbo.build/repo/docs)

@docs/TESTING.md
@.cursorrules
