#!/usr/bin/env bash
# =============================================================================
# make claim — claim pending $GITLAWB rewards
# =============================================================================
# Safe to run any time. Returns "no rewards" cleanly if there's nothing to claim.
# =============================================================================
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PKG_DIR}"

exec docker compose run --rm gl node claim
