#!/usr/bin/env bash
# =============================================================================
# make stake — register node on Base with 10,000 $GITLAWB
# =============================================================================
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PKG_DIR}"

# shellcheck source=/dev/null
[[ -f .env ]] || { echo "Missing .env. Run 'make init' first." >&2; exit 1; }
set -a; . ./.env; set +a

if [[ -z "${GITLAWB_PUBLIC_URL:-}" ]]; then
  echo "GITLAWB_PUBLIC_URL is empty in .env. Set it before staking." >&2
  exit 1
fi

STAKE_AMOUNT="${STAKE_AMOUNT:-10000}"

echo "Registering node:"
echo "  Stake:       ${STAKE_AMOUNT} \$GITLAWB"
echo "  Public URL:  ${GITLAWB_PUBLIC_URL}"
echo
echo "This sends two on-chain transactions on Base (token.approve + NodeStaking.registerNode)."
read -rp "Proceed? [y/N] " confirm
[[ "${confirm:-N}" =~ ^[yY]$ ]] || { echo "Aborted."; exit 1; }

exec docker compose run --rm gl node register \
  --stake "${STAKE_AMOUNT}" \
  --http-url "${GITLAWB_PUBLIC_URL}"
