#!/usr/bin/env bash
# =============================================================================
# make backup-did — export the node DID to a PEM file in ./backups/
# =============================================================================
# Wraps `gl identity backup`. The keypair lives in the gitlawb-data Docker
# volume at /data/.gitlawb/identity.pem inside the container; this command
# writes a copy to the host so you can store it somewhere durable.
#
# If you lose this file AND the Docker volume, you cannot recover your node
# identity. Your 10,000 $GITLAWB stake is bound to the DID — losing it means
# unstaking (7-day cooldown) and re-registering with a new DID.
# =============================================================================
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PKG_DIR}"

mkdir -p backups
TS="$(date +%Y%m%d-%H%M%S)"
CONTAINER_PATH="/backups/identity-${TS}.pem.bak"
HOST_PATH="backups/identity-${TS}.pem.bak"

docker compose run --rm gl identity backup --out "${CONTAINER_PATH}"

# gl ran as root, so the file is currently owned by root on the host. Chown it
# back to the host user so they can move/delete it without sudo.
docker compose run --rm --entrypoint sh gl -c \
  "chown $(id -u):$(id -g) /backups/identity-${TS}.pem.bak && chmod 600 /backups/identity-${TS}.pem.bak"

if [[ ! -f "${HOST_PATH}" ]]; then
  echo "Backup file not visible at ${PKG_DIR}/${HOST_PATH}" >&2
  echo "Check container output above for errors." >&2
  exit 1
fi

cat <<EOF

  ✓ Backup written to: ${PKG_DIR}/${HOST_PATH}

  STORE THIS FILE SOMEWHERE DURABLE AND OFF THIS MACHINE.

  Good options:
    - 1Password / Bitwarden secure-note attachment
    - Encrypted USB drive kept somewhere safe
    - GPG-encrypted then committed to a private vault:
        gpg -c ${HOST_PATH}

  Then delete the host copy to reduce surface area:
        shred -u ${HOST_PATH}    # Linux
        rm -P ${HOST_PATH}        # macOS

  Without this backup, losing the Docker volume means losing your DID and
  locking your stake to an identity you no longer control.
EOF
