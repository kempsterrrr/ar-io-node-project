# C2PA Manual Testing Procedure

Step-by-step runbook for validating the C2PA end-to-end flow on a production deployment.

**Production URL:** `https://ario.agenticway.io`
**Sidecar port:** 3003 (internal, proxied via nginx)
**Verify sidecar port:** 4001 (internal, proxied via nginx)

---

## Prerequisites

- `curl` and `jq` installed
- Access to the Hetzner server (for container/log inspection)
- For upload tests: Node.js 18+, pnpm, and an Ethereum wallet with Turbo credits

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

From the Hetzner server (sidecar is not publicly exposed by default):

```bash
# SSH into the server, then:
curl -s http://localhost:3003/health | jq .
```

Expected: `{"success": true, ...}` with database status and signing capability.

### 1.4 Verify Sidecar Health

```bash
curl -s http://localhost:4001/health | jq .
```

Expected: `{"status": "ok"}` or similar health response.

### 1.5 Container Status

```bash
cd ~/ar-io-gateway
docker compose -f docker-compose.yaml \
  -f sidecar/docker-compose.sidecar.yaml \
  -f verify-sidecar/docker-compose.verify.yaml \
  ps
```

All containers should show `Up` and `healthy`.

### 1.6 Gateway Webhook Configuration

Verify the gateway `.env` includes the C2PA webhook settings:

```bash
grep -E 'WEBHOOK_|ANS104_INDEX' ~/ar-io-gateway/.env
```

Expected output:

```
WEBHOOK_TARGET_SERVERS=http://trusthash-sidecar:3003/webhook
WEBHOOK_INDEX_FILTER={"tags":[{"name":"Protocol","value":"C2PA-Manifest-Proof"},{"name":"C2PA-Storage-Mode"},{"name":"C2PA-Manifest-ID"},{"name":"C2PA-Soft-Binding-Alg"},{"name":"C2PA-Soft-Binding-Value"}]}
ANS104_INDEX_FILTER={"tags":[{"name":"Protocol","value":"C2PA-Manifest-Proof"}]}
```

If these are missing, the gateway will not send webhooks and the indexing pipeline is broken.

---

## 2. Signing Oracle (requires ENABLE_SIGNING=true)

### 2.1 Retrieve Certificate Chain

```bash
curl -s http://localhost:3003/v1/cert
```

Expected: PEM-encoded X.509 certificate chain. If signing is disabled, returns 501.

### 2.2 Sign a Test Payload

```bash
echo -n "test-payload" | curl -s -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @- \
  http://localhost:3003/v1/sign | wc -c
```

Expected: 64 bytes (ES256/P-256 IEEE P1363 signature format).

---

## 3. Webhook Indexing (Simulated)

This test validates that the sidecar correctly processes webhook payloads without requiring an actual Arweave upload.

### 3.1 Send a Synthetic Webhook

```bash
MANIFEST_ID="urn:c2pa:manual-test-$(date +%s)"
TX_ID="manual-test-tx-$(date +%s)"
PHASH_B64=$(openssl rand -base64 8)

curl -s -X POST http://localhost:3003/webhook \
  -H "Content-Type: application/json" \
  -d "{
    \"tx_id\": \"${TX_ID}\",
    \"tags\": [
      {\"name\": \"Protocol\", \"value\": \"C2PA-Manifest-Proof\"},
      {\"name\": \"Protocol-Version\", \"value\": \"1.0.0\"},
      {\"name\": \"Content-Type\", \"value\": \"application/c2pa\"},
      {\"name\": \"C2PA-Manifest-ID\", \"value\": \"${MANIFEST_ID}\"},
      {\"name\": \"C2PA-Storage-Mode\", \"value\": \"manifest\"},
      {\"name\": \"C2PA-Asset-Hash\", \"value\": \"dGVzdA\"},
      {\"name\": \"C2PA-Manifest-Store-Hash\", \"value\": \"dGVzdA\"},
      {\"name\": \"C2PA-Manifest-Repo-URL\", \"value\": \"http://localhost:3003/v1\"},
      {\"name\": \"C2PA-Soft-Binding-Alg\", \"value\": \"org.ar-io.phash\"},
      {\"name\": \"C2PA-Soft-Binding-Value\", \"value\": \"${PHASH_B64}\"},
      {\"name\": \"C2PA-Claim-Generator\", \"value\": \"manual-test/1.0\"}
    ],
    \"owner\": \"test-owner\",
    \"block_height\": 9999999,
    \"block_timestamp\": $(date +%s)
  }" | jq .
```

Expected:

```json
{
  "success": true,
  "data": {
    "txId": "manual-test-tx-...",
    "action": "indexed"
  }
}
```

### 3.2 Query Back via SBR API

```bash
curl -s "http://localhost:3003/v1/matches/byBinding?alg=org.ar-io.phash&value=${PHASH_B64}" | jq .
```

Expected: Response contains a `matches` array with the manifest ID from step 3.1.

### 3.3 Verify Duplicate Rejection

Re-send the same webhook from step 3.1 (same TX_ID):

Expected: `"action": "skipped"` with `"reason": "Already indexed"`.

---

## 4. SBR API Queries

### 4.1 Supported Algorithms

```bash
curl -s http://localhost:3003/v1/services/supportedAlgorithms | jq .
```

Expected: List including `org.ar-io.phash` and `io.iscc.v0`.

### 4.2 Manifest Retrieval

```bash
# Use a manifest ID from a previously indexed transaction
curl -s http://localhost:3003/v1/manifests/<MANIFEST_ID> -o /dev/null -w "%{http_code}"
```

Expected: 200 (with `application/c2pa` bytes) or 302 redirect to the manifest source.

### 4.3 Content-Based Lookup (Image Upload)

```bash
curl -s -X POST http://localhost:3003/v1/matches/byContent \
  -F "file=@/path/to/test-image.jpg" | jq .
```

Expected: `matches` array with manifests that have a similar pHash to the uploaded image.

---

## 5. End-to-End Upload Test

This requires the turbo-c2pa SDK and an Ethereum wallet with Turbo credits.

### 5.1 Sign Mode (Full Pipeline)

From the project root:

```bash
cd packages/turbo-c2pa

# Set environment variables
export ETH_PRIVATE_KEY="<your-eth-private-key>"
export SIDECAR_URL="http://localhost:3003"
export GATEWAY_URL="https://turbo-gateway.com"

# Upload and sign an image
pnpm exec tsx scripts/demo-upload.ts /path/to/image.jpg --source-type digitalCapture
```

Expected output:

- Signed image saved locally
- Arweave transaction ID printed
- Manifest ID printed

### 5.2 Wait for Gateway Indexing

After upload, the gateway needs to index the transaction (may take minutes depending on block confirmation):

```bash
# Check if the transaction is available on the gateway
curl -sL https://ario.agenticway.io/<ARWEAVE_TX_ID> -o /dev/null -w "%{http_code}"
```

Expected: 200 once indexed.

### 5.3 Verify Webhook Was Received

Check sidecar logs for the webhook:

```bash
cd ~/ar-io-gateway
docker compose -f docker-compose.yaml \
  -f sidecar/docker-compose.sidecar.yaml \
  -f verify-sidecar/docker-compose.verify.yaml \
  logs trusthash-sidecar --tail 50 | grep "webhook"
```

Expected: Log entry showing `Manifest indexed from webhook` with the transaction ID.

### 5.4 Query via SBR

```bash
# Use the manifest ID from the upload output
curl -s "http://localhost:3003/v1/manifests/<MANIFEST_ID>" | head -c 100
```

---

## 6. Verify Sidecar

### 6.1 Verify a Transaction

```bash
curl -s -X POST http://localhost:4001/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"txId": "<ARWEAVE_TX_ID>"}' | jq .
```

Expected: JSON with `verificationId`, `tier`, `existence`, `integrity`, and `metadata` fields.

### 6.2 Download PDF Attestation

```bash
# Use the verificationId from step 6.1
curl -s http://localhost:4001/api/v1/verify/<VERIFICATION_ID>/pdf \
  -o attestation.pdf
```

Expected: Valid PDF file downloaded.

---

## 7. E2E Demo Script (Automated)

The sidecar includes an automated E2E demo that tests signing, webhook indexing, and SBR queries in sequence:

```bash
cd packages/trusthash-sidecar

# Against local sidecar
pnpm exec tsx scripts/demo-e2e.ts

# Against production (from the server)
BASE_URL=http://localhost:3003 pnpm exec tsx scripts/demo-e2e.ts
```

This runs 7 steps: health check, certificate retrieval, COSE signing, webhook simulation, SBR byBinding query, similarity search, and summary.

---

## Troubleshooting

### Gateway not sending webhooks

1. Check `.env` has `WEBHOOK_TARGET_SERVERS` and `WEBHOOK_INDEX_FILTER` set
2. Restart the gateway after changing `.env`:
   ```bash
   docker compose -f docker-compose.yaml ... restart core
   ```
3. Check gateway logs for webhook delivery errors:
   ```bash
   docker compose ... logs core | grep -i webhook
   ```

### Sidecar not indexing

1. Check sidecar container is running: `docker compose ... ps trusthash-sidecar`
2. Check sidecar logs: `docker compose ... logs trusthash-sidecar --tail 100`
3. Common issues:
   - `Protocol` tag missing or wrong value (must be `C2PA-Manifest-Proof`)
   - `C2PA-Storage-Mode` missing (must be `full`, `manifest`, or `proof`)
   - Invalid pHash in `C2PA-Soft-Binding-Value` (must be valid base64, 8 bytes)

### Manifests not discoverable via SBR

1. Confirm the manifest was indexed: check sidecar logs for `Manifest indexed`
2. Confirm `ANS104_INDEX_FILTER` is set so the gateway indexes C2PA bundle data items
3. Check DuckDB has data:
   ```bash
   docker compose ... exec trusthash-sidecar ls -la /app/data/provenance.duckdb
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
