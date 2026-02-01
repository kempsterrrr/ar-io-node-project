# =============================================================================
# OpenClaw Agent Deployment
# =============================================================================
# Deploys OpenClaw with the AR.IO Gateway plugin from npm.
# This image is built on the OpenClaw server and installs everything fresh.
#
# Update procedure:
#   docker compose build --no-cache   # Rebuilds with latest versions
#   docker compose up -d              # Redeploys, volumes preserve state
#
# What persists across updates (via volumes):
#   - /home/node/.openclaw/ - Config, tokens, auth profiles
#   - /home/node/.openclaw/workspace/ - Agent artifacts, memories
#
# What gets updated on rebuild:
#   - OpenClaw binary (from npm)
#   - Plugin code (from npm)
#   - System dependencies (from Dockerfile)
# =============================================================================

FROM node:22-slim

# Install system dependencies (baked in - survives restarts)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    curl \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create directories with proper permissions
RUN mkdir -p /home/node/.openclaw/workspace /home/node/.ssh \
    && chown -R node:node /home/node

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Install the AR.IO plugin - set HOME so it installs to /home/node/.openclaw/
ENV HOME=/home/node
RUN npx openclaw plugins install @kempsterrrr/openclaw-ario-plugin

# Copy default config (can be overridden by volume mount)
COPY --chown=node:node openclaw.json /home/node/.openclaw/openclaw.json

USER node
WORKDIR /home/node

ENV NODE_ENV=production
ENV HOME=/home/node

EXPOSE 18789

CMD ["npx", "openclaw", "start"]
