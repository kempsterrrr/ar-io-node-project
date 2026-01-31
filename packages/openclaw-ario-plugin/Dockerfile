# OpenClaw with AR.IO Gateway Plugin
# Builds OpenClaw and installs the AR.IO gateway plugin
#
# Plugin structure:
#   /home/node/.openclaw/extensions/ario-gateway/
#   ├── package.json              (with main: "dist/index.js")
#   └── dist/
#       ├── index.js              (compiled plugin entry point)
#       └── openclaw.plugin.json  (plugin manifest with id: "ario-gateway")

FROM node:22-slim AS builder

WORKDIR /build

# Copy plugin source
COPY package.json tsconfig.json ./
COPY src/ ./src/
COPY openclaw.plugin.json ./

# Install dependencies and build
RUN npm install && npm run build

# Production image
FROM ghcr.io/openclaw/openclaw:latest

# Create all required directories with proper permissions
USER root
RUN mkdir -p /home/node/.openclaw/extensions/ario-gateway \
    /home/node/.openclaw/devices \
    /home/node/.openclaw/canvas \
    /home/node/.openclaw/cron \
    /home/node/.openclaw/workspace \
    && chown -R node:node /home/node/.openclaw

# Copy built plugin to extensions directory
# Folder name MUST match the plugin ID in openclaw.plugin.json ("ario-gateway")
# OpenClaw expects: manifest alongside entry point in dist/
COPY --from=builder --chown=node:node /build/dist /home/node/.openclaw/extensions/ario-gateway/dist
COPY --from=builder --chown=node:node /build/openclaw.plugin.json /home/node/.openclaw/extensions/ario-gateway/dist/
COPY --from=builder --chown=node:node /build/package.json /home/node/.openclaw/extensions/ario-gateway/

USER node

# Default command runs the gateway
CMD ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
