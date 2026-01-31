# OpenClaw with AR.IO Gateway Plugin
# Builds OpenClaw and installs the AR.IO gateway plugin

FROM node:22-slim AS builder

WORKDIR /build

# Copy plugin source
COPY package.json tsconfig.json ./
COPY src/ ./src/
COPY openclaw.plugin.json ./

# Install dependencies and build
RUN npm install && npm run build

# Copy manifest to dist folder (OpenClaw expects it next to the entry point)
RUN cp openclaw.plugin.json dist/

# Production image
FROM ghcr.io/openclaw/openclaw:latest

# Create all required directories with proper permissions
USER root
RUN mkdir -p /home/node/.openclaw/extensions/ario-gateway/dist \
    /home/node/.openclaw/devices \
    /home/node/.openclaw/canvas \
    /home/node/.openclaw/cron \
    /home/node/.openclaw/workspace \
    && chown -R node:node /home/node/.openclaw

# Copy built plugin to extensions directory
COPY --from=builder --chown=node:node /build/dist /home/node/.openclaw/extensions/ario-gateway/dist
COPY --from=builder --chown=node:node /build/openclaw.plugin.json /home/node/.openclaw/extensions/ario-gateway/
COPY --from=builder --chown=node:node /build/package.json /home/node/.openclaw/extensions/ario-gateway/

USER node

# Default command runs the gateway
CMD ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
