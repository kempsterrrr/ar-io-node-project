#!/usr/bin/env bash
# =============================================================================
# Gitlawb Sidecar — first-run bootstrap
# =============================================================================
# Idempotent: refuses to clobber an existing .env. Run once when setting up.
#   1. Copies .env.example -> .env (chmod 600)
#   2. Prompts for public URL, Base RPC, operator key, contract addr, Pinata JWT
#   3. Generates the node DID via `gl identity new` in a one-shot container
#   4. Prints the DID and next-step instructions
# =============================================================================
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PKG_DIR}/.env"
ENV_EXAMPLE="${PKG_DIR}/.env.example"

red()    { printf '\033[31m%s\033[0m\n' "$*" >&2; }
yellow() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

if [[ -f "${ENV_FILE}" ]]; then
  red ".env already exists at ${ENV_FILE}"
  red "Refusing to overwrite. Delete it manually if you want to re-run init."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  red "docker not found. Install Docker before running this script."
  exit 1
fi

if ! docker network inspect ar-io-network >/dev/null 2>&1; then
  yellow "ar-io-network not found. Bring your AR.IO gateway up first; it creates the network."
  yellow "Continuing anyway — you can re-run after the gateway is up if compose fails."
fi

bold "Gitlawb Sidecar bootstrap"
echo
echo "This will collect the configuration values needed to run a Gitlawb node"
echo "alongside your AR.IO gateway. Defaults are shown in [brackets]; press Enter"
echo "to accept. Nothing is sent anywhere — values are written to ${ENV_FILE}."
echo

# ---------------------------------------------------------------------------
# Public URL
# ---------------------------------------------------------------------------
echo "1) Public URL (HTTPS) that peers will use to reach your node."
echo "   Typically an ArNS subdomain routed by your gateway's Envoy to gitlawb-node:7545."
echo "   Example: https://git.yourgateway.example"
read -rp "   Public URL: " PUBLIC_URL
if [[ -z "${PUBLIC_URL}" ]]; then
  red "Public URL is required."
  exit 1
fi

# ---------------------------------------------------------------------------
# Base RPC
# ---------------------------------------------------------------------------
echo
echo "2) Base L2 RPC endpoint. The node uses it to register stake and post heartbeats."
echo "   Free option: https://mainnet.base.org (rate-limited)"
echo "   Better: an Alchemy/Infura/QuickNode endpoint."
read -rp "   Base RPC URL [https://mainnet.base.org]: " BASE_RPC
BASE_RPC="${BASE_RPC:-https://mainnet.base.org}"

# ---------------------------------------------------------------------------
# Operator private key
# ---------------------------------------------------------------------------
echo
bold "3) Operator Ethereum private key (for staking + heartbeat txs on Base)."
yellow "   READ THIS BEFORE PASTING A KEY:"
yellow "   - This wallet pays gas on every heartbeat (~\$0.03/month, negligible)."
yellow "   - You must fund it with >= 10,000 \$GITLAWB and a small amount of ETH."
yellow "   - DO NOT reuse a wallet that holds significant value. Generate a"
yellow "     dedicated operator key and transfer only what you need to stake."
echo
read -rsp "   Private key (0x... hex, hidden input): " OPERATOR_KEY
echo
if [[ -z "${OPERATOR_KEY}" ]]; then
  yellow "   Skipping — you can paste it into .env later, but make stake/status/claim won't work until you do."
fi

# ---------------------------------------------------------------------------
# Staking contract address
# ---------------------------------------------------------------------------
echo
echo "4) NodeStaking contract address on Base."
echo "   Required if you plan to stake (which is how you earn rewards)."
echo "   Skip if you just want to run a node without registering on-chain."
echo "   See https://github.com/Gitlawb/node/blob/main/docs/RUN-A-NODE.md for the canonical deployment."
read -rp "   GITLAWB_CONTRACT_NODE_STAKING (0x..., leave blank to skip): " STAKING_ADDR

# ---------------------------------------------------------------------------
# Pinata JWT (optional)
# ---------------------------------------------------------------------------
echo
echo "5) Pinata JWT (optional, but recommended)."
echo "   When set, git objects pushed to your node are pinned to Pinata + IPFS,"
echo "   and the IPFS CID is embedded in the Arweave anchor. This is what makes"
echo "   your repos reachable by AR.IO-side indexers and other mirrors."
echo "   Sign up: https://pinata.cloud and create a JWT with pin/upload scope."
read -rsp "   Pinata JWT (leave blank to skip, hidden input): " PINATA_JWT
echo

# ---------------------------------------------------------------------------
# Write .env
# ---------------------------------------------------------------------------
cp "${ENV_EXAMPLE}" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

# Portable sed -i (BSD/GNU). Each line escapes a separator we won't see in
# any of these values.
update_env() {
  local key="$1" value="$2"
  local sep='|'
  local pattern="^${key}=.*"
  local replacement="${key}=${value}"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s${sep}${pattern}${sep}${replacement}${sep}" "${ENV_FILE}"
    else
      sed -i "s${sep}${pattern}${sep}${replacement}${sep}" "${ENV_FILE}"
    fi
  else
    printf '\n%s\n' "${replacement}" >> "${ENV_FILE}"
  fi
}

update_env GITLAWB_PUBLIC_URL "${PUBLIC_URL}"
update_env GITLAWB_CHAIN_RPC_URL "${BASE_RPC}"
[[ -n "${OPERATOR_KEY}" ]]  && update_env GITLAWB_OPERATOR_PRIVATE_KEY "${OPERATOR_KEY}"
[[ -n "${STAKING_ADDR}" ]]  && update_env GITLAWB_CONTRACT_NODE_STAKING "${STAKING_ADDR}"
[[ -n "${PINATA_JWT}" ]]    && update_env GITLAWB_PINATA_JWT "${PINATA_JWT}"

# Auto-generate a strong POSTGRES_PASSWORD if the operator hasn't set one.
# This avoids shipping a default password and keeps the secret out of the
# prompts (the operator never needs to see or type it).
CURRENT_PWD="$(grep '^POSTGRES_PASSWORD=' "${ENV_FILE}" | cut -d= -f2-)"
if [[ -z "${CURRENT_PWD}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    PG_PWD="$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 32)"
  else
    PG_PWD="$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n' | head -c 32)"
  fi
  update_env POSTGRES_PASSWORD "${PG_PWD}"
fi

green "Wrote ${ENV_FILE} (chmod 600)."

# ---------------------------------------------------------------------------
# Generate node DID
# ---------------------------------------------------------------------------
echo
bold "6) Generating node DID..."
cd "${PKG_DIR}"
DID_GENERATED=false
if docker compose run --rm gl identity new; then
  echo
  bold "   Current node identity:"
  docker compose run --rm gl identity show || true
  DID_GENERATED=true
else
  yellow "   gl identity new failed. You can re-run it later with:"
  yellow "     docker compose run --rm gl identity new"
fi

# ---------------------------------------------------------------------------
# Immediate DID backup prompt
# ---------------------------------------------------------------------------
if [[ "${DID_GENERATED}" == "true" ]]; then
  echo
  bold "7) Back up your DID NOW."
  yellow "   The keypair lives in a Docker volume. If the volume is lost (machine"
  yellow "   replaced, accidental \`docker volume rm\`, host failure), your 10k"
  yellow "   \$GITLAWB stake is bound to a DID you can no longer prove you own."
  echo
  read -rp "   Run \`make backup-did\` now? [Y/n] " backup_now
  if [[ "${backup_now:-Y}" =~ ^[yY]$ || -z "${backup_now}" ]]; then
    "${PKG_DIR}/scripts/backup-did.sh"
  else
    yellow "   Skipped. Run \`make backup-did\` BEFORE you run \`make stake\`."
  fi
fi

# ---------------------------------------------------------------------------
# Next steps
# ---------------------------------------------------------------------------
echo
green "Bootstrap complete."
echo
bold "Next steps:"
echo "  1. Paste the Envoy route snippet from scripts/envoy-route-snippet.yaml"
echo "     into your gateway's Envoy config and reload Envoy."
echo "  2. Open TCP/7546 on your host firewall (libp2p)."
echo "  3. Fund the operator wallet with ETH on Base + 10,000 \$GITLAWB."
echo "  4. make up           # start the node"
echo "  5. make backup-did   # if you skipped step 7 above"
echo "  6. make stake        # register on-chain"
echo "  7. make status       # confirm heartbeat + registration"
