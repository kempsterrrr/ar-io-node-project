#!/usr/bin/env bash
# =============================================================================
# make unstake-request / make unstake — two-step withdrawal with 7-day cooldown
# =============================================================================
# Usage:
#   ./scripts/unstake.sh request     # start the 7-day timer
#   ./scripts/unstake.sh finalize    # finalize after >= 7 days; returns stake + rewards
# =============================================================================
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PKG_DIR}"

cmd="${1:-}"
case "${cmd}" in
  request)
    echo "This starts a 7-day cooldown. You can still earn rewards during it"
    echo "as long as you keep posting heartbeats."
    read -rp "Proceed? [y/N] " confirm
    [[ "${confirm:-N}" =~ ^[yY]$ ]] || { echo "Aborted."; exit 1; }
    exec docker compose run --rm gl node unstake-request
    ;;
  finalize)
    echo "Finalizing unstake. This returns your stake + any pending rewards."
    read -rp "Proceed? [y/N] " confirm
    [[ "${confirm:-N}" =~ ^[yY]$ ]] || { echo "Aborted."; exit 1; }
    exec docker compose run --rm gl node unstake
    ;;
  *)
    echo "Usage: $0 {request|finalize}" >&2
    exit 1
    ;;
esac
