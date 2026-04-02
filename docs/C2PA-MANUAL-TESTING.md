# C2PA Manual Testing Procedure

Step-by-step runbook for validating the C2PA end-to-end flow on the production deployment.

**Base URL:** `https://ario.agenticway.io`

| Service                  | Public URL                              | Internal         |
| ------------------------ | --------------------------------------- | ---------------- |
| Gateway                  | `https://ario.agenticway.io/`           | `localhost:3000` |
| Trusthash sidecar (C2PA) | `https://ario.agenticway.io/trusthash/` | `localhost:3003` |
| Verify sidecar           | `https://ario.agenticway.io/verify/`    | `localhost:4001` |

The nginx config at `apps/gateway/nginx/ario-agenticway` routes `/trusthash/*` and `/verify/*` to the respective sidecars, stripping the prefix. The `/webhook` endpoint is blocked externally by the sidecar's own nginx proxy (internal gateway-to-sidecar only).

---

## Prerequisites

- `curl` and `jq` installed
- For upload tests: Node.js 18+, pnpm, and an Ethereum wallet with Turbo credits
- SSH access to Hetzner server (only needed for log inspection and webhook config checks)

## 1. Pre-flight Checks

### 1.1 Gateway Health

```bash
curl -s https://ario.agenticway.io/ar-io/info | jq .
```

Expected: JSON with `processId`, `release`, `wallet`, etc.

### 1.2 Gateway Data Serving

```bash
curl -sL https://ario.agenticway.io/4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM
```

Expected: `test`

### 1.3 Trusthash Sidecar Health

```bash
curl -s https://ario.agenticway.io/trusthash/health | jq .
```

Expected: `{"success": true, ...}` with database status and signing capability.

### 1.4 Verify Sidecar Health

```bash
curl -s https://ario.agenticway.io/verify/health | jq .
```

Expected: `{"status": "ok"}` or similar health response.

### 1.5 Container Status (requires SSH)

```bash
cd ~/ar-io-gateway
docker compose -f docker-compose.yaml \
  -f sidecar/docker-compose.sidecar.yaml \
  -f verify-sidecar/docker-compose.verify.yaml \
  ps
```

All containers should show `Up` and `healthy`.

### 1.6 Gateway Webhook Configuration (requires SSH)

Verify the gateway `.env` includes the C2PA webhook settings:

```bash
grep -E 'WEBHOOK_|ANS104_INDEX' ~/ar-io-gateway/.env
```

Expected output:

```
WEBHOOK_TARGET_SERVERS=http://trusthash-sidecar:3003/webhook
WEBHOOK_INDEX_FILTER={"tags":[{"name":"Protocol","value":"C2PA-Manifest-Proof"}]}
ANS104_INDEX_FILTER={"tags":[{"name":"Protocol","value":"C2PA-Manifest-Proof"}]}
```

The webhook filter is intentionally broad (only requires the `Protocol` tag). The sidecar validates all required fields and gracefully skips incomplete payloads.

If these are missing, the gateway will not send webhooks and the indexing pipeline is broken.

---

## 2. Signing Oracle (requires ENABLE_SIGNING=true)

### 2.1 Retrieve Certificate Chain

```bash
curl -s https://ario.agenticway.io/trusthash/v1/cert
```

Expected: PEM-encoded X.509 certificate chain. If signing is disabled, returns 501.

### 2.2 Sign a Test Payload

```bash
echo -n "test-payload" | curl -s -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @- \
  https://ario.agenticway.io/trusthash/v1/sign | wc -c
```

Expected: 64 bytes (ES256/P-256 IEEE P1363 signature format).

---

## 3. SBR API Queries

### 3.1 Supported Algorithms

```bash
curl -s https://ario.agenticway.io/trusthash/v1/services/supportedAlgorithms | jq .
```

Expected: List including `org.ar-io.phash` and `io.iscc.v0`.

### 3.2 Query by Binding

```bash
curl -s "https://ario.agenticway.io/trusthash/v1/matches/byBinding?alg=org.ar-io.phash&value=<BASE64_PHASH>" | jq .
```

Expected: `matches` array with any manifests matching the given pHash value.

### 3.3 Content-Based Lookup (Image Upload)

```bash
curl -s -X POST https://ario.agenticway.io/trusthash/v1/matches/byContent \
  -F "file=@/path/to/test-image.jpg" | jq .
```

Expected: `matches` array with manifests that have a similar pHash to the uploaded image.

### 3.4 Manifest Retrieval

```bash
# Use a manifest ID from a previously indexed transaction
curl -s https://ario.agenticway.io/trusthash/v1/manifests/<MANIFEST_ID> -o /dev/null -w "%{http_code}\n"
```

Expected: 200 (with `application/c2pa` bytes) or 302 redirect to the manifest source.

---

## 4. End-to-End Upload Test (Sign Mode)

This requires the turbo-c2pa SDK and an Ethereum wallet with Turbo credits.

### 4.1 Upload and Sign an Image

From the project root:

```bash
cd packages/turbo-c2pa

export ETH_PRIVATE_KEY="<your-eth-private-key>"
export SIDECAR_URL="https://ario.agenticway.io/trusthash"
export GATEWAY_URL="https://turbo-gateway.com"

pnpm exec tsx scripts/demo-upload.ts /path/to/image.jpg --source-type digitalCapture
```

Expected output:

- Signed image saved locally
- Arweave transaction ID printed
- Manifest ID printed

Save the TX ID and Manifest ID for the following steps.

### 4.2 Wait for Gateway Indexing

After upload, wait for the gateway to index the transaction (may take a few minutes):

```bash
# Poll until the transaction is available
curl -sL https://ario.agenticway.io/<ARWEAVE_TX_ID> -o /dev/null -w "%{http_code}\n"
```

Expected: 200 once indexed.

### 4.3 Verify Webhook Was Received (requires SSH)

Check sidecar logs for the webhook:

```bash
cd ~/ar-io-gateway
docker compose -f docker-compose.yaml \
  -f sidecar/docker-compose.sidecar.yaml \
  -f verify-sidecar/docker-compose.verify.yaml \
  logs trusthash-sidecar --tail 50 | grep -i "indexed\|webhook"
```

Expected: Log entry showing `Manifest indexed from webhook` with the transaction ID.

### 4.4 Query the Manifest via SBR

```bash
# By manifest ID
curl -s "https://ario.agenticway.io/trusthash/v1/manifests/<MANIFEST_ID>" | head -c 200

# By soft binding (use the pHash from the upload output)
curl -s "https://ario.agenticway.io/trusthash/v1/matches/byBinding?alg=org.ar-io.phash&value=<PHASH_B64>" | jq .
```

Expected: Manifest bytes returned, and the manifest appears in the binding query results.

### 4.5 Content-Based Rediscovery

Upload the same image to find it via content matching:

```bash
curl -s -X POST https://ario.agenticway.io/trusthash/v1/matches/byContent \
  -F "file=@/path/to/same-image.jpg" | jq .
```

Expected: The manifest from step 4.1 appears in the matches.

---

## 5. End-to-End Upload Test (Store Mode)

Store mode preserves an existing C2PA manifest without re-signing.

### 5.1 Upload an Image with Existing C2PA

```bash
cd packages/turbo-c2pa

export ETH_PRIVATE_KEY="<your-eth-private-key>"
export SIDECAR_URL="https://ario.agenticway.io/trusthash"
export GATEWAY_URL="https://turbo-gateway.com"

pnpm exec tsx scripts/demo-upload.ts /path/to/image-with-c2pa.jpg --store
```

Expected: Original image bytes preserved, Arweave TX ID and Manifest ID printed.

### 5.2 Verify Indexing and Retrieval

Follow the same steps as 4.2-4.5 using the TX ID and Manifest ID from the store mode upload.

---

## 6. Verify Sidecar

### 6.1 Verify a Transaction

```bash
curl -s -X POST https://ario.agenticway.io/verify/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"txId": "<ARWEAVE_TX_ID>"}' | jq .
```

Expected: JSON with `verificationId`, `tier`, `existence`, `integrity`, and `metadata` fields.

### 6.2 Download PDF Attestation

```bash
# Use the verificationId from step 6.1
curl -s https://ario.agenticway.io/verify/api/v1/verify/<VERIFICATION_ID>/pdf \
  -o attestation.pdf
```

Expected: Valid PDF file downloaded.

---

## 7. E2E Demo Script (Automated)

The sidecar includes an automated E2E demo that tests signing, webhook indexing, and SBR queries in one run. The webhook test in this script sends directly to the sidecar's internal webhook endpoint, so it must be run from the server or against a local instance.

```bash
cd packages/trusthash-sidecar

# Against local sidecar
pnpm exec tsx scripts/demo-e2e.ts

# Against production (from the Hetzner server)
BASE_URL=http://localhost:3003 pnpm exec tsx scripts/demo-e2e.ts
```

This runs 7 steps: health check, certificate retrieval, COSE signing, webhook simulation, SBR byBinding query, similarity search, and summary.

---

## Troubleshooting

### Gateway not sending webhooks

1. Check `.env` has `WEBHOOK_TARGET_SERVERS` and `WEBHOOK_INDEX_FILTER` set
2. Restart the gateway after changing `.env`:
   ```bash
   cd ~/ar-io-gateway
   docker compose -f docker-compose.yaml \
     -f sidecar/docker-compose.sidecar.yaml \
     -f verify-sidecar/docker-compose.verify.yaml \
     restart core
   ```
3. Check gateway logs for webhook delivery errors:
   ```bash
   docker compose -f docker-compose.yaml \
     -f sidecar/docker-compose.sidecar.yaml \
     -f verify-sidecar/docker-compose.verify.yaml \
     logs core | grep -i webhook
   ```

### Sidecar not indexing

1. Check sidecar container is running and healthy (section 1.5)
2. Check sidecar logs:
   ```bash
   docker compose -f docker-compose.yaml \
     -f sidecar/docker-compose.sidecar.yaml \
     -f verify-sidecar/docker-compose.verify.yaml \
     logs trusthash-sidecar --tail 100
   ```
3. Common issues:
   - `Protocol` tag missing or wrong value (must be `C2PA-Manifest-Proof`)
   - `C2PA-Storage-Mode` missing (must be `full`, `manifest`, or `proof`)
   - Invalid pHash in `C2PA-Soft-Binding-Value` (must be valid base64, 8 bytes)

### Manifests not discoverable via SBR

1. Confirm the manifest was indexed: check sidecar logs for `Manifest indexed`
2. Confirm `ANS104_INDEX_FILTER` is set so the gateway indexes C2PA bundle data items
3. Check DuckDB has data:
   ```bash
   docker compose -f docker-compose.yaml \
     -f sidecar/docker-compose.sidecar.yaml \
     -f verify-sidecar/docker-compose.verify.yaml \
     exec trusthash-sidecar ls -la /app/data/provenance.duckdb
   ```

### Signing returns 501

- `ENABLE_SIGNING` is `false` or not set
- Check `SIGNING_CERT_PEM` and `SIGNING_PRIVATE_KEY_PEM` are correctly populated
- For dev testing, generate dev certs: `./packages/trusthash-sidecar/scripts/generate-dev-cert.sh`

### Gateway not serving uploaded data

- The gateway must have synced past the block containing the transaction
- Check `START_HEIGHT` in `.env` - if set too high, older transactions won't be indexed
- For new uploads via Turbo, data is typically available within a few minutes
- Check: `curl -s https://ario.agenticway.io/ar-io/info | jq .currentBlock`

### Public URL returns 404 for sidecar endpoints

- Ensure the nginx config at `apps/gateway/nginx/ario-agenticway` has the `/trusthash/` and `/verify/` location blocks
- Verify nginx was reloaded after the last deploy: `nginx -t && systemctl reload nginx`
- Note: `/webhook` is intentionally blocked externally (returns 404) - webhooks flow internally from gateway to sidecar
