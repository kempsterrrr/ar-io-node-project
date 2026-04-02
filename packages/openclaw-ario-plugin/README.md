# @kempsterrrr/openclaw-ario-plugin

OpenClaw plugin for AR.IO gateways and Arweave, powered by `@agenticway/sdk`.

## Tools

### Gateway Tools

- **gateway_info** — Get gateway status and information
- **gateway_fetch** — Fetch Arweave transactions by ID (with optional data)
- **gateway_resolve** — Resolve ArNS names to transaction IDs
- **gateway_search** — Search transactions by tags or owner addresses

### Storage & Integrity Tools (new in v0.2.0)

- **arweave_store** — Store data permanently on Arweave
- **arweave_verify** — Verify on-chain existence and integrity of a transaction
- **arweave_anchor** — Anchor data hash on Arweave (integrity proof)
- **arweave_verify_anchor** — Verify data against an existing integrity anchor

### SSH Tools (optional)

- **gateway_ssh_execute** — Execute arbitrary SSH commands
- **gateway_status** — Get Docker container status
- **gateway_restart** — Restart Docker containers
- **gateway_logs** — View Docker logs
- **gateway_update** — Update gateway (pull images + restart)

## Configuration

```json
{
  "gatewayUrl": "https://arweave.net",
  "timeout": 30000,
  "turboWallet": "0x...",
  "trusthashUrl": "https://trusthash.example.com",
  "ssh": {
    "host": "gateway.example.com",
    "user": "root",
    "keyPath": "~/.ssh/id_rsa"
  }
}
```

## Usage

```typescript
import plugin from '@kempsterrrr/openclaw-ario-plugin';

// Register with OpenClaw
plugin.register(api, {
  gatewayUrl: 'https://arweave.net',
  turboWallet: process.env.TURBO_WALLET,
});
```

## Changes in v0.2.0

- Replaced raw HTTP `GatewayClient` with `@agenticway/sdk` (`AgenticWay` class)
- Added 4 new tools: `arweave_store`, `arweave_verify`, `arweave_anchor`, `arweave_verify_anchor`
- Added `turboWallet` and `trusthashUrl` config options for write operations and C2PA provenance
- Switched build tooling to tsup + vitest (matching other adapter packages)
