# Gitlawb Sidecar — Roadmap

Direction, not commitment. Versions land as upstream Gitlawb features stabilize
and as AR.IO operators give feedback on what they actually want.

## v0.1 — Operator install (current)

The bare-minimum runbook. A gateway operator can:

- Bring up `gitlawb-node` + Postgres joined to `ar-io-network`
- Generate a node DID and persist it across recreates
- Register stake and post heartbeats on Base L2 via `make stake` / `make status`
- Have HTTPS + ArNS routing via the gateway's existing Envoy
- Pull the prebuilt image from GHCR

Out of scope: monitoring beyond `make status`, AR.IO-native anchoring, indexing.

## v0.2 — Observability

Make it possible to leave a node running without checking on it daily.

- Prometheus exporter for: last heartbeat timestamp, stake amount, registration
  status, recent push count, pinning success rate
- Grafana dashboard JSON shipped in the package
- Alertmanager rules for "heartbeat older than 22h" (the 24h cliff that excludes
  a node from rewards)
- Optional: status webhook (Slack/Discord/email) on heartbeat failure

## v0.3 — AR.IO-native anchor bridge

Replace the Irys dependency with an AR.IO-side bundler. AR.IO operators stop
needing Irys credits and start paying for anchoring with Turbo credits or
x402 — whatever their gateway already supports.

- New service in the package: `gitlawb-anchor-bridge`
- HTTP shim that exposes an Irys-compatible upload endpoint
- Forwards to Turbo SDK or the existing `x402-bundler-sidecar`
- Gitlawb is pointed at it via `GITLAWB_IRYS_URL=http://gitlawb-anchor-bridge:PORT`
- Wallet posture: pass-through signed bundles by default; custodial mode
  (operator-funded wallet) as an opt-in

Likely shares signer/wallet utilities with `packages/x402-bundler-sidecar/` and
`packages/turbo-c2pa/` — one reason the sidecar lives in this monorepo.

## v0.4 — Gateway as Gitlawb mirror (indexer mode)

Extend AR.IO gateways into the Gitlawb retrieval surface.

Gitlawb anchors carry tags `App-Name=gitlawb`, `Schema=gitlawb/ref-update/v1`,
`Repo`, `Ref`, `SHA`, `Node-DID`. When the upstream node has Pinata enabled,
the anchor payload also includes an IPFS CID for the pushed objects.

- New service: `gitlawb-index-sidecar`
- Watches the gateway's Arweave index for `App-Name=gitlawb` transactions
- Materializes `repo DID → refs → commits` in SQLite/Postgres
- For anchors with CIDs: serves `git clone https://git.<gateway>/<repo>.git`
  by resolving objects via IPFS (embedded Helia + public-gateway fallback)
- Verifies `Node-DID` signatures against the `gitlawb/ref-update/v1` schema so
  mirrored repos can be labeled "cryptographically verified"
- Anchors without CIDs surface as a history-only view (no clone, just commit
  metadata)

This is the layer that makes AR.IO gateways meaningful infrastructure for
Gitlawb, not just adjacent.

## v0.5 — ArNS auto-registration

On first `make stake`, optionally claim a `git_<node-did>.<gateway-arns>`
ArNS name so the node's public URL is reachable and self-describing without
manual DNS / ArNS work.

Depends on the gateway operator having ArNS allowance and being willing to
let the sidecar spend it.
