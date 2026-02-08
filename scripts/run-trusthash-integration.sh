#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${INTEGRATION_COMPOSE_FILE:-${ROOT_DIR}/docker-compose.integration.yaml}"
DATA_DIR="${INTEGRATION_DATA_DIR:-${ROOT_DIR}/packages/trusthash-sidecar/data-test}"
DB_PATH="${INTEGRATION_DB_PATH:-${DATA_DIR}/provenance.test.duckdb}"
BASE_URL="${INTEGRATION_BASE_URL:-http://localhost:3003}"
REFERENCE_URL="${REFERENCE_TEST_URL:-http://gateway-stub/reference.png}"

MANIFEST_TX_ID="${INTEGRATION_MANIFEST_TX_ID:-test-tx-0001}"
MANIFEST_ID="${INTEGRATION_MANIFEST_ID:-urn:uuid:00000000-0000-0000-0000-000000000000}"

FIXTURES_DIR="${ROOT_DIR}/packages/trusthash-sidecar/tests/fixtures/gateway"
MANIFEST_FILE="${FIXTURES_DIR}/${MANIFEST_TX_ID}"
REFERENCE_FILE="${REFERENCE_TEST_FILE:-${FIXTURES_DIR}/reference.png}"

PHASH_HEX="0000000000000000"
SOFT_BINDING_VALUE="AAAAAAAAAAA="

cleanup() {
  if [[ "${KEEP_INTEGRATION_CONTAINERS:-0}" != "1" ]]; then
    docker compose -f "${COMPOSE_FILE}" down >/dev/null 2>&1 || true
  fi
  if [[ "${KEEP_INTEGRATION_DATA:-0}" != "1" ]]; then
    rm -rf "${DATA_DIR}"
  fi
}

trap cleanup EXIT

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Missing compose file: ${COMPOSE_FILE}"
  exit 1
fi

if [[ ! -f "${MANIFEST_FILE}" ]]; then
  echo "Missing gateway fixture: ${MANIFEST_FILE}"
  exit 1
fi
if [[ ! -f "${REFERENCE_FILE}" ]]; then
  echo "Missing reference fixture: ${REFERENCE_FILE}"
  exit 1
fi

if [[ "${KEEP_INTEGRATION_DATA:-0}" != "1" ]]; then
  rm -rf "${DATA_DIR}"
fi
mkdir -p "${DATA_DIR}"

docker compose -f "${COMPOSE_FILE}" up -d --build

for _ in {1..30}; do
  if curl -sf "${BASE_URL}/health" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -sf "${BASE_URL}/health" >/dev/null; then
  echo "Sidecar did not become healthy at ${BASE_URL}."
  exit 1
fi

seed_payload=$(cat <<EOF
{
  "tx_id": "${MANIFEST_TX_ID}",
  "tags": [
    { "name": "Content-Type", "value": "application/c2pa" },
    { "name": "Manifest-Type", "value": "sidecar" },
    { "name": "C2PA-Manifest-Id", "value": "${MANIFEST_ID}" },
    { "name": "C2PA-SoftBinding-Alg", "value": "org.ar-io.phash" },
    { "name": "C2PA-SoftBinding-Value", "value": "${SOFT_BINDING_VALUE}" },
    { "name": "pHash", "value": "${PHASH_HEX}" }
  ],
  "owner": "integration-test",
  "block_height": 1,
  "block_timestamp": 1700000000
}
EOF
)

curl -sf -X POST "${BASE_URL}/webhook" \
  -H "Content-Type: application/json" \
  -d "${seed_payload}" >/dev/null

(
  cd "${ROOT_DIR}/packages/trusthash-sidecar"
  RUN_INTEGRATION=1 \
  INTEGRATION_BASE_URL="${BASE_URL}" \
  INTEGRATION_DB_PATH="${DB_PATH}" \
  REFERENCE_TEST_URL="${REFERENCE_URL}" \
  REFERENCE_TEST_FILE="${REFERENCE_FILE}" \
  bun test
)
