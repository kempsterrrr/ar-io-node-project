# Build stage
FROM oven/bun:1.2 AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json bun.lock* ./

# Copy verify sidecar package
COPY packages/verify-sidecar/package.json packages/verify-sidecar/

# Install dependencies
RUN bun install

# Copy sidecar source code
COPY packages/verify-sidecar/ packages/verify-sidecar/

# Build the backend for Node.js runtime
RUN cd packages/verify-sidecar && bun build src/index.ts --outdir dist --target node

# Build the frontend
RUN cd packages/verify-sidecar/web && bun install && bun run build

# Production stage
FROM node:20-bookworm-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy built backend and dependencies
COPY --from=builder /app/packages/verify-sidecar/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/verify-sidecar/package.json ./

# Copy built frontend
COPY --from=builder /app/packages/verify-sidecar/web/dist ./web/dist

# Create directory for data
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production
ENV PORT=4001

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4001/health || exit 1

CMD ["node", "dist/index.js"]
