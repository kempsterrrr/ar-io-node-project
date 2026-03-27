# =============================================================================
# Verify Sidecar — Docker image
# =============================================================================
# Uses bun as both build and runtime.
# Native modules (better-sqlite3) require explicit postinstall via npm
# because bun does not reliably run lifecycle scripts for native addons.
# Frontend is built with vite during the image build.
# =============================================================================

FROM oven/bun:1.2

WORKDIR /app

# Install build tools for native modules and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl npm \
    && rm -rf /var/lib/apt/lists/*

# Copy root workspace files
COPY package.json bun.lock* ./

# Copy verify sidecar package
COPY packages/verify-sidecar/package.json packages/verify-sidecar/

# Install dependencies with bun
RUN bun install

# Explicitly build native modules that bun skips
RUN cd node_modules/better-sqlite3 && npx --yes node-gyp rebuild --release

# Copy sidecar source code
COPY packages/verify-sidecar/ packages/verify-sidecar/

# Build the frontend (vite)
RUN cd packages/verify-sidecar/web && bun install && bun run build

# Create directory for data
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production
ENV PORT=4001
ENV SQLITE_PATH=/app/data/verify.db

EXPOSE 4001

WORKDIR /app/packages/verify-sidecar

CMD ["bun", "run", "src/index.ts"]
