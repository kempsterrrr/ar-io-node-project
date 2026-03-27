# =============================================================================
# Trusthash Sidecar — Docker image
# =============================================================================
# Uses bun as both build and runtime to avoid native module bundling issues
# (DuckDB, sharp, c2pa-node, @iscc/lib all have .node binaries).
# =============================================================================

FROM oven/bun:1.2

WORKDIR /app

# Copy root workspace files
COPY package.json bun.lock* ./

# Copy workspace packages needed for dependency resolution
COPY packages/c2pa-protocol/ packages/c2pa-protocol/
COPY packages/trusthash-sidecar/package.json packages/trusthash-sidecar/

# Install dependencies
RUN bun install

# Copy sidecar source code
COPY packages/trusthash-sidecar/ packages/trusthash-sidecar/

# Create directory for data
RUN mkdir -p /app/data

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Set environment
ENV NODE_ENV=production
ENV PORT=3003

EXPOSE 3003

WORKDIR /app/packages/trusthash-sidecar

CMD ["bun", "run", "src/index.ts"]
