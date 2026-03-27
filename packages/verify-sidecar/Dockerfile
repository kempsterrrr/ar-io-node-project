# =============================================================================
# Verify Sidecar — Docker image
# =============================================================================
# Uses bun as both build and runtime to avoid native module bundling issues
# (better-sqlite3 has a .node binary that can't be bundled).
# Frontend is built with vite during the image build.
# =============================================================================

FROM oven/bun:1.2

WORKDIR /app

# Copy root workspace files
COPY package.json bun.lock* ./

# Copy verify sidecar package
COPY packages/verify-sidecar/package.json packages/verify-sidecar/

# Install dependencies
RUN bun install

# Copy sidecar source code
COPY packages/verify-sidecar/ packages/verify-sidecar/

# Build the frontend (vite)
RUN cd packages/verify-sidecar/web && bun install && bun run build

# Create directory for data
RUN mkdir -p /app/data

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Set environment
ENV NODE_ENV=production
ENV PORT=4001
ENV SQLITE_PATH=/app/data/verify.db

EXPOSE 4001

WORKDIR /app/packages/verify-sidecar

CMD ["bun", "run", "src/index.ts"]
