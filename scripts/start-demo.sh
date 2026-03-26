#!/usr/bin/env bash
#
# Start the trusthash sidecar with C2PA signing enabled.
# Run this in one terminal, then use the demo-upload.ts script in another.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SIDECAR_DIR="${SCRIPT_DIR}/../packages/trusthash-sidecar"
CERT_DIR="${SIDECAR_DIR}/.dev-certs"

# Generate dev certs if they don't exist
if [ ! -f "${CERT_DIR}/cert-chain.pem" ]; then
  echo "Generating development certificates..."
  "${SIDECAR_DIR}/scripts/generate-dev-cert.sh"
  echo ""
  echo "Copy the SIGNING_* and C2PA_TRUST_ANCHOR_PEM values to your .env files."
  echo ""
fi

# Check if .env has signing config
if [ -f "${SIDECAR_DIR}/.env" ] && grep -q "ENABLE_SIGNING=true" "${SIDECAR_DIR}/.env"; then
  echo "Starting sidecar with signing enabled..."
else
  echo "WARNING: ENABLE_SIGNING not set in ${SIDECAR_DIR}/.env"
  echo "Copy the output from generate-dev-cert.sh to ${SIDECAR_DIR}/.env"
  echo ""
  echo "Required .env entries:"
  echo "  ENABLE_SIGNING=true"
  echo "  SIGNING_ALGORITHM=ES256"
  echo "  SIGNING_CERT_PEM=<base64 cert chain>"
  echo "  SIGNING_PRIVATE_KEY_PEM=<base64 private key>"
  exit 1
fi

cd "${SIDECAR_DIR}"
exec bun run dev
