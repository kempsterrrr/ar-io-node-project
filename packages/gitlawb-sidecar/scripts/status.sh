#!/usr/bin/env bash
# =============================================================================
# make status — print on-chain registration + heartbeat info
# =============================================================================
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PKG_DIR}"

exec docker compose run --rm gl node onchain-status
