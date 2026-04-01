#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"

cd "$DEPLOY_DIR"

# Create .env from example if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit it if your gateway uses a different container name."
fi

source .env

# Check ar-io-network exists
if ! docker network inspect ar-io-network >/dev/null 2>&1; then
  echo "ERROR: ar-io-network does not exist. Start your AR.IO gateway first."
  exit 1
fi

# Build the image if using local tag and it doesn't exist
IMAGE="${VERIFY_IMAGE:-verify-sidecar:local}"
if [[ "$IMAGE" == *":local"* ]] && ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building verify-sidecar image from repo..."
  docker build -f "$REPO_ROOT/packages/verify-sidecar/Dockerfile" -t "$IMAGE" "$REPO_ROOT"
fi

# Start services
docker compose up -d

echo ""
echo "Verify sidecar is starting."
echo "  UI:     http://localhost:${VERIFY_PORT:-4001}/verify/"
echo "  API:    http://localhost:${VERIFY_PORT:-4001}/api"
echo "  Health: http://localhost:${VERIFY_PORT:-4001}/health"
echo ""
echo "Logs: docker compose -f $DEPLOY_DIR/docker-compose.yaml logs -f"
