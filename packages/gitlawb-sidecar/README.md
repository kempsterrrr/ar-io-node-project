# Gitlawb Sidecar

Run a [Gitlawb](https://github.com/Gitlawb/node) decentralized git node
alongside your AR.IO gateway. The sidecar packages everything an operator
needs — Docker image, Postgres, identity bootstrap, staking helpers, Envoy
routing — so you can go from a running gateway to a registered Gitlawb node
in under 20 minutes.

> Status: **v0.1** — operator install. See [`ROADMAP.md`](./ROADMAP.md) for
> what's coming (AR.IO-native anchoring, gateway-as-mirror indexer, etc).

## What you get

- `gitlawb-node` + dedicated Postgres joined to your gateway's `ar-io-network`
- Prebuilt image at `ghcr.io/kempsterrrr/gitlawb-sidecar`
- One-command bootstrap (`make init`) for node DID + `.env`
- Make targets that wrap the upstream `gl` CLI:
  `make stake`, `make status`, `make claim`, `make unstake-request`, `make unstake`
- Envoy route snippet for HTTPS + ArNS routing
- Roadmap for monitoring, AR.IO-native anchoring, and indexer mode

## Prerequisites

1. **A running AR.IO gateway.** The sidecar joins its `ar-io-network`. If the
   gateway isn't up first, the sidecar won't have a network to attach to.
2. **An operator Ethereum wallet on Base** with:
   - ≥ **10,000 $GITLAWB** for the stake
   - Small amount of ETH for gas (~0.005 ETH covers many months of heartbeats
     at ~$0.03/month per the upstream docs)
   - **Use a dedicated wallet** — do not reuse a personal wallet that holds
     other assets. `make init` will warn you about this.
3. **Your gateway's existing public hostname.** The sidecar is exposed as a
   path on your gateway's base URL (e.g. `https://your-gateway.example/gitlawb`)
   via an Envoy route — no new DNS, no separate TLS certificate, no subdomain.
   See [Why not a subdomain?](#why-not-a-subdomain) below.
4. **TCP/7546 reachable from the public internet.** Gitlawb uses libp2p for
   peer gossip on this port. Open it in your firewall and (if behind NAT)
   forward it to your gateway host. This port does **not** go through Envoy.

## Install

### 1. Bring up your gateway

Standard AR.IO gateway start — the sidecar depends on `ar-io-network`
existing.

```bash
cd apps/gateway
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
```

### 2. Bootstrap the sidecar

```bash
cd packages/gitlawb-sidecar
make init
```

`make init` will:

- Prompt for your public URL, Base RPC, operator private key, NodeStaking
  contract address, and (optional) Pinata JWT
- Write `.env` at mode `600` (gitignored)
- Run `gl identity new` in a one-shot container to generate your Ed25519 node
  DID, persisted in the `gitlawb-data` Docker volume
- Offer to run `make backup-did` immediately (strongly recommended — see below)
- Print the DID and next-step instructions

### 3. Back up the DID

This is the most important operational step. The node DID is bound to your
on-chain stake; losing it means losing the ability to operate the node, and
your 10k $GITLAWB is locked to a DID you can no longer prove you own.

```bash
make backup-did
# → writes backups/identity-<timestamp>.pem.bak (chmod 600)
```

Move that file somewhere durable and off this machine:

- 1Password / Bitwarden secure-note attachment
- Encrypted USB drive
- `gpg -c backups/identity-*.pem.bak` then store the `.gpg` in a private vault

Then `shred -u` (Linux) or `rm -P` (macOS) the host copy. The DID is also
safe in the Docker volume — the backup is for when the volume isn't.

If you ever need to restore (new server, lost volume, recovery):

```bash
make restore-did FILE=path/to/identity-<timestamp>.pem.bak
```

### 4. Wire up Envoy on the gateway

Path-based routing: requests to `https://<your-gateway>/gitlawb/...` get
proxied to the sidecar's port 7545. Open
[`scripts/envoy-route-snippet.yaml`](./scripts/envoy-route-snippet.yaml)
and paste the route entries into your gateway's `envoy.template.yaml`
(under `root_service.routes`, before the catch-all `/` route) and the
cluster entry into the top-level `clusters:` list. Then:

```bash
# From your gateway compose dir, after editing envoy.template.yaml:
docker compose restart envoy
```

This follows the same pattern the upstream Envoy template already uses for
`/bundler/` and `/ao/cu/` routes — we just add `/gitlawb/`.

### 5. Open TCP/7546

```bash
# Example (ufw)
sudo ufw allow 7546/tcp
```

If you're behind NAT, forward the port from your router to the gateway host.

### 6. Start the node

```bash
make up
make logs   # confirm clean startup
```

Sanity check the public URL:

```bash
curl -s https://your-gateway.example/gitlawb/health
# → 200 OK
```

### 7. Stake

```bash
make stake
```

This sends two on-chain txs on Base (`token.approve` then
`NodeStaking.registerNode`) using the key in your `.env`. Confirm:

```bash
make status
# → shows registered=true and a recent heartbeat
```

You're done. The node will post heartbeats automatically every ~20 hours and
earn pro-rata rewards from the weekly fee distribution.

## Day-to-day

| Task                           | Command                              |
| ------------------------------ | ------------------------------------ |
| Check heartbeat / registration | `make status`                        |
| Claim rewards                  | `make claim`                         |
| Tail logs                      | `make logs`                          |
| Shell into the node            | `make shell`                         |
| Restart after `.env` change    | `make restart`                       |
| Pull latest image              | `make upgrade`                       |
| Stop the stack                 | `make down`                          |
| Refresh DID backup             | `make backup-did`                    |
| Restore DID on new server      | `make restore-did FILE=path/to/.bak` |

## Disaster recovery

If your server dies or the `gitlawb-data` Docker volume is lost, your node's
DID is gone — _unless_ you have a backup. To recover on a new machine:

```bash
# 1. Bring up your AR.IO gateway as usual (creates ar-io-network)
# 2. cd packages/gitlawb-sidecar
# 3. cp .env.example .env   # then fill in the same values as the old install,
#                           # including the SAME operator private key
# 4. Restore the identity from your safe backup:
make restore-did FILE=/path/to/identity-<timestamp>.pem.bak

# 5. Start the node — Postgres will be empty but the DID matches your on-chain stake
make up
make status   # should show registered=true against the same DID
```

The node will rebuild any local state from peers and the chain. The 10k
$GITLAWB stake stays bonded to the DID — it doesn't need to be re-staked.

## Withdrawing

Unstaking is a two-step process with a **7-day cooldown** (upstream's design).

```bash
make unstake-request  # starts the 7-day timer
# ... wait at least 7 days ...
make unstake          # returns your stake + any pending rewards
```

You continue earning rewards during cooldown as long as you keep posting
heartbeats.

## Troubleshooting

**`ar-io-network not found`**
The gateway isn't running. Bring it up first.

**`make status` says my node isn't registered**
Check that `GITLAWB_OPERATOR_PRIVATE_KEY` and `GITLAWB_CONTRACT_NODE_STAKING`
are set in `.env` and that the wallet has gas + 10k $GITLAWB. Then run
`make stake`.

**Heartbeat is more than 22 hours old**
You're approaching the 24h cutoff that excludes the node from rewards.
Check `make logs` for errors. The most common cause is an expired RPC
endpoint or insufficient ETH on the operator wallet.

**`curl https://<your-gateway>/gitlawb/health` returns nothing**
The Envoy route isn't reaching the sidecar. Confirm:

- The `/gitlawb/` route was added to the `root_service` virtual_host (NOT to
  the `arns_resolution_service` one) and is listed **before** the catch-all
  `- match: { prefix: '/' }` route
- `docker network inspect ar-io-network` shows both `envoy` and `gitlawb-node`
- `docker compose exec envoy curl -f http://gitlawb-node:7545/health` works
  from inside the network
- `prefix_rewrite: '/'` is present on both `/gitlawb/` and `/gitlawb` routes
  so the node sees its own root paths

**Peers can't reach me / no inbound libp2p traffic**
TCP/7546 isn't open. Check firewall and NAT forwarding. `curl ifconfig.me`
to confirm your public IP, then `nc -zv <public-ip> 7546` from a different
network.

## Upgrading

Image upgrades:

```bash
make upgrade
```

Major Gitlawb upstream upgrades (binary-incompatible config changes) will be
called out in this repo's release notes; `make upgrade` plus any `.env`
adjustments noted there is enough.

## Why not a subdomain?

An earlier draft of this sidecar exposed the node at `git.<your-gateway>`.
That was wrong. AR.IO gateways reserve the entire `*.<ARNS_ROOT_HOST>`
subdomain namespace for ArNS (Arweave Name System) resolution:

> "Ar.io gateways will also resolve that name as one of their own subdomains,
> e.g., `https://ardrive.arweave.net` and proxy all requests to the associated
> Arweave transaction ID. This means that ANTs work across all ar.io gateways
> that support them."
>
> — [ar.io docs / learn / arns](https://docs.ar.io/learn/arns)

Squatting any subdomain (`git`, `gitlawb`, anything) would:

- **Shadow real or future ArNS names.** If anyone ever registers `git` in
  the ArNS registry, users hitting `git.<my-gateway>` would see this Gitlawb
  node instead of the registered content — but only on my gateway. Behavior
  diverges from every other gateway in the network.
- **Break the cross-gateway consistency property** that ArNS is built on.

So we use path-based routing on the gateway's base hostname instead:
`https://<gateway>/gitlawb/...`. This is the same pattern the gateway already
uses for built-in non-ArNS endpoints (`/ar-io/*`, `/raw/*`, `/graphql`,
`/bundler/`, `/ao/cu/`). Envoy strips the `/gitlawb` prefix and forwards to
`gitlawb-node:7545` on `ar-io-network`.

## Architecture

```text
https://<gateway>/gitlawb/...
                     ┌──────────────────────────────┐
   git push ──────►  │  gateway Envoy               │
   git clone ─────►  │  TLS + ArNS at *.<gateway>   │
                     │  /gitlawb/* → strip → node   │
                     └──────────┬───────────────────┘
                                │ http://gitlawb-node:7545
                                ▼
                     ┌────────────────────────┐         ┌──────────────────┐
                     │  gitlawb-node          │ ──────► │ gitlawb-postgres │
                     │  (Rust, /data volume)  │         │ (16-alpine)      │
                     └──────────┬─────────────┘         └──────────────────┘
                                │ libp2p :7546 (host-bound)
                                ▼
                       Gitlawb peer network
```

Three services on `ar-io-network`:

- `gitlawb-postgres` — internal only
- `gitlawb-node` — listens on `:7545` (HTTP+git, internal) and `:7546` (libp2p, host-bound)
- `gl` — short-lived ops container, runs the upstream CLI for `make` targets

The `gitlawb-data` named volume persists the node DID, on-chain state cache,
and any other data the node writes. Postgres data lives in
`gitlawb-postgres-data`.

## Building from source (development)

If you want to rebuild the image locally against a different upstream commit:

```bash
GITLAWB_SHA=<sha> docker build \
  --build-arg GITLAWB_SHA=<sha> \
  -t my-gitlawb-sidecar:dev \
  packages/gitlawb-sidecar/
```

Then point `GITLAWB_SIDECAR_IMAGE` in `.env` at your local tag.

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md). v0.2 adds Prometheus + alerts, v0.3 routes
anchoring through your gateway's bundler (no more Irys), v0.4 turns AR.IO
gateways into Gitlawb mirrors.

## License

MIT. Wraps the upstream Gitlawb node ([Gitlawb/node](https://github.com/Gitlawb/node))
which is under its own license.
