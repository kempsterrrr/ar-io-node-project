# =============================================================================
# Trusthash Sidecar — Docker image
# =============================================================================
# Uses bun as both build and runtime to avoid native module bundling issues
# (DuckDB, sharp, c2pa-node, @iscc/lib all have .node binaries).
# Build tools (python3, make, g++) are needed for DuckDB's node-pre-gyp.
# =============================================================================

FROM oven/bun:1.2

WORKDIR /app

# Install build tools for native modules (DuckDB node-pre-gyp) and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Copy root workspace files
COPY package.json bun.lock* ./

# Copy workspace packages needed for dependency resolution
COPY packages/c2pa-protocol/ packages/c2pa-protocol/
COPY packages/trusthash-sidecar/package.json packages/trusthash-sidecar/

# Install dependencies with lifecycle scripts enabled for native modules
RUN bun install --trust

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
