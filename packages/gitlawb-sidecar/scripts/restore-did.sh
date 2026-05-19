#!/usr/bin/env bash
# =============================================================================
# make restore-did FILE=<path-to-backup.pem.bak>
# =============================================================================
# Wraps `gl identity restore`. Use when migrating to a new server or
# recovering from a lost Docker volume.
#
# Idempotency: if an identity already exists in the volume, the restore
# overwrites it (after a confirmation prompt). The new identity becomes the
# node's identity on the gitlawb network.
# =============================================================================
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PKG_DIR}"

SRC="${1:-${FILE:-}}"
if [[ -z "${SRC}" ]]; then
  echo "Usage: make restore-did FILE=<path-to-identity.pem.bak>" >&2
  echo "   or: ./scripts/restore-did.sh <path>" >&2
  exit 1
fi

if [[ ! -f "${SRC}" ]]; then
  echo "Backup file not found: ${SRC}" >&2
  exit 1
fi

mkdir -p backups
STAGE="backups/.restore-staging.pem"
cp "${SRC}" "${STAGE}"
chmod 600 "${STAGE}"

trap 'rm -f "${STAGE}"' EXIT

echo "Restoring identity from: ${SRC}"
echo "This overwrites the current identity in the gitlawb-data volume."
read -rp "Proceed? [y/N] " confirm
[[ "${confirm:-N}" =~ ^[yY]$ ]] || { echo "Aborted."; exit 1; }

docker compose run --rm gl identity restore "/backups/$(basename "${STAGE}")" --force

# gl ran as root and wrote to /data; chown to uid 10001 so gitlawb-node can read.
docker compose run --rm --entrypoint sh gl -c \
  'chown -R 10001:0 /data && chmod -R ug+rwX /data' >/dev/null 2>&1 || true

echo "✓ Identity restored. Run 'make status' to confirm on-chain registration."
