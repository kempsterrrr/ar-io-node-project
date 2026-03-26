# Build stage
FROM oven/bun:1.2 AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json bun.lock* ./

# Copy workspace packages needed for dependency resolution
COPY packages/c2pa-protocol/package.json packages/c2pa-protocol/
COPY packages/c2pa-protocol/src/ packages/c2pa-protocol/src/
COPY packages/trusthash-sidecar/package.json packages/trusthash-sidecar/

# Install dependencies (no --frozen-lockfile: partial workspace context differs from full lockfile)
RUN bun install

# Copy sidecar source code
COPY packages/trusthash-sidecar/ packages/trusthash-sidecar/

# Build the application for Node.js runtime
RUN cd packages/trusthash-sidecar && bun build src/index.ts src/migrate.ts --outdir dist --target node

# Production stage
FROM node:20-bookworm-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy built application and dependencies
COPY --from=builder /app/packages/trusthash-sidecar/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/trusthash-sidecar/package.json ./

# Create directory for data
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production
ENV PORT=3003

EXPOSE 3003

CMD ["node", "dist/index.js"]
