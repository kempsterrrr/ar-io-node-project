# =============================================================================
# Trusthash Sidecar — Docker image
# =============================================================================
# Uses bun as both build and runtime.
# Native modules (DuckDB) require explicit postinstall via npm/node-pre-gyp
# because bun does not reliably run lifecycle scripts for native addons.
# =============================================================================

FROM oven/bun:1.2

WORKDIR /app

# Install build tools for native modules and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl npm \
    && rm -rf /var/lib/apt/lists/*

# Copy root workspace files
COPY package.json bun.lock* ./

# Copy workspace packages needed for dependency resolution
COPY packages/c2pa-protocol/ packages/c2pa-protocol/
COPY packages/trusthash-sidecar/package.json packages/trusthash-sidecar/

# Install dependencies with bun
RUN bun install

# Explicitly build native modules that bun skips
RUN cd node_modules/duckdb && node-pre-gyp install --fallback-to-build

# Copy sidecar source code
COPY packages/trusthash-sidecar/ packages/trusthash-sidecar/

# Create directory for data
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production
ENV PORT=3003
ENV DUCKDB_PATH=/app/data/provenance.duckdb

EXPOSE 3003

WORKDIR /app/packages/trusthash-sidecar

CMD ["bun", "run", "src/index.ts"]
