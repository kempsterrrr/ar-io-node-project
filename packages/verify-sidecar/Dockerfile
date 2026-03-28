# =============================================================================
# Verify Sidecar — Docker image
# =============================================================================
# Node.js runtime with pnpm for dependency management.
# Native modules (better-sqlite3) compile correctly via pnpm lifecycle scripts.
# Frontend is built with vite during the image build.
# =============================================================================

FROM node:20-bookworm-slim

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Install build tools for native modules (better-sqlite3 node-gyp) and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy verify sidecar and web package configs
COPY packages/verify-sidecar/package.json packages/verify-sidecar/
COPY packages/verify-sidecar/web/package.json packages/verify-sidecar/web/

# Install all workspace deps including web/ (pnpm runs lifecycle scripts by default)
RUN pnpm install --frozen-lockfile

# Copy sidecar source code
COPY packages/verify-sidecar/ packages/verify-sidecar/

# Build the backend
RUN pnpm --filter @ar-io/verify-sidecar run build

# Build the frontend (deps already installed via workspace)
RUN pnpm --filter verify-web run build

# Create directory for data
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production
ENV PORT=4001
ENV SQLITE_PATH=/app/data/verify.db

EXPOSE 4001

WORKDIR /app/packages/verify-sidecar

CMD ["node", "dist/index.js"]
