# =============================================================================
# Trusthash Sidecar — Docker image
# =============================================================================
# Node.js runtime with pnpm for dependency management.
# Native modules (DuckDB, sharp) compile correctly via pnpm lifecycle scripts.
# =============================================================================

FROM node:20-bookworm-slim

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Install build tools for native modules (DuckDB node-pre-gyp, sharp) and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy workspace packages needed for dependency resolution
COPY packages/c2pa-protocol/ packages/c2pa-protocol/
COPY packages/trusthash-sidecar/package.json packages/trusthash-sidecar/

# Install dependencies (pnpm runs lifecycle scripts by default)
RUN pnpm install --frozen-lockfile

# Copy sidecar source code
COPY packages/trusthash-sidecar/ packages/trusthash-sidecar/

# Build the backend
RUN pnpm --filter @ar-io/trusthash-sidecar run build

# Create directory for data
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production
ENV PORT=3003
ENV DUCKDB_PATH=/app/data/provenance.duckdb

EXPOSE 3003

WORKDIR /app/packages/trusthash-sidecar

CMD ["node", "dist/index.js"]
