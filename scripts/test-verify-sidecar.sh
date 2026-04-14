#!/usr/bin/env bash
# =============================================================================
# Verify Sidecar Integration Tests
# =============================================================================
# Tests the verify sidecar against a running local gateway + sidecar stack.
#
# Prerequisites:
#   docker compose -f docker-compose.local.yaml up -d
#
# Usage:
#   ./scripts/test-verify-sidecar.sh
# =============================================================================
set -euo pipefail

VERIFY_URL="${VERIFY_URL:-http://localhost:4001}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"

# Known test transaction IDs
# Small L1 transaction (manifest, ~227 bytes) — should reach Level 2
TX_SMALL="4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM"
# Another known transaction (book content)
TX_BOOK="3lyxgbgEvqNSvJrTX2J7CfRychUD5KClFhhVLyTPNCQ"

PASS=0
FAIL=0
TOTAL=0

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: $1"
  if [[ -n "${2:-}" ]]; then
    echo "        $2"
  fi
}

assert_status() {
  local label="$1" url="$2" method="${3:-GET}" expected="${4:-200}" body="${5:-}"
  local actual
  if [[ "$method" == "POST" ]]; then
    actual=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "$body" "$url")
  else
    actual=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  fi
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label" "expected HTTP $expected, got $actual"
  fi
}

assert_json_field() {
  local label="$1" json="$2" field="$3" expected="$4"
  local actual
  actual=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d${field})" 2>/dev/null || echo "__ERROR__")
  if [[ "$actual" == "$expected" ]]; then
    pass "$label"
  else
    fail "$label" "expected '$expected', got '$actual'"
  fi
}

assert_json_field_not_empty() {
  local label="$1" json="$2" field="$3"
  local actual
  actual=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d${field}; print('empty' if v is None or v == '' else 'ok')" 2>/dev/null || echo "__ERROR__")
  if [[ "$actual" == "ok" ]]; then
    pass "$label"
  else
    fail "$label" "field is empty or null"
  fi
}

echo "============================================"
echo "Verify Sidecar Integration Tests"
echo "============================================"
echo "Verify URL: ${VERIFY_URL}"
echo "Gateway URL: ${GATEWAY_URL}"
echo ""

# --- Pre-flight ---
echo "--- Pre-flight checks ---"

gw_health=$(curl -sf "${GATEWAY_URL}/ar-io/info" 2>/dev/null || echo "")
if [[ -n "$gw_health" ]]; then
  pass "Gateway is reachable"
else
  fail "Gateway is reachable" "Cannot reach ${GATEWAY_URL}/ar-io/info"
  echo ""
  echo "ABORT: Gateway must be running. Start with:"
  echo "  docker compose -f docker-compose.local.yaml up -d"
  exit 1
fi

vs_health=$(curl -sf "${VERIFY_URL}/health" 2>/dev/null || echo "")
if [[ -n "$vs_health" ]]; then
  pass "Verify sidecar is reachable"
else
  fail "Verify sidecar is reachable" "Cannot reach ${VERIFY_URL}/health"
  echo ""
  echo "ABORT: Verify sidecar must be running. Start with:"
  echo "  docker compose -f docker-compose.local.yaml up verify-sidecar verify-proxy -d"
  exit 1
fi

assert_json_field "Health: status=ok" "$vs_health" "['status']" "ok"
assert_json_field "Health: gateway=true" "$vs_health" "['gateway']" "True"

echo ""

# --- API metadata ---
echo "--- API metadata ---"
assert_status "GET /api returns 200" "${VERIFY_URL}/api/"
assert_status "GET /api-docs/ returns 200" "${VERIFY_URL}/api-docs/"

echo ""

# --- Input validation ---
echo "--- Input validation ---"
assert_status "POST /verify with invalid txId returns 400" "${VERIFY_URL}/api/v1/verify" "POST" "400" '{"txId":"invalid"}'
assert_status "POST /verify with empty body returns 400" "${VERIFY_URL}/api/v1/verify" "POST" "400" '{}'
assert_status "POST /verify with too-short txId returns 400" "${VERIFY_URL}/api/v1/verify" "POST" "400" '{"txId":"abc"}'
assert_status "GET /verify/nonexistent returns 404" "${VERIFY_URL}/api/v1/verify/vrf_doesnotexist000" "GET" "404"

echo ""

# --- Verify a known L1 transaction ---
echo "--- Verify L1 transaction (${TX_SMALL}) ---"
result=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"txId\":\"${TX_SMALL}\"}" \
  "${VERIFY_URL}/api/v1/verify" 2>/dev/null)

if [[ -z "$result" || "$result" == *"error"* ]]; then
  fail "POST /verify returns verification result" "got: $result"
else
  pass "POST /verify returns verification result"

  assert_json_field "txId matches request" "$result" "['txId']" "$TX_SMALL"
  assert_json_field_not_empty "verificationId is set" "$result" "['verificationId']"
  assert_json_field_not_empty "timestamp is set" "$result" "['timestamp']"

  # Level should be 2 or 3 (hash or signature verified)
  level=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['level'])")
  if [[ "$level" -ge 2 ]]; then
    pass "Verification level >= 2 (got $level)"
  else
    fail "Verification level >= 2" "got $level"
  fi

  # Existence
  assert_json_field "existence.status = confirmed" "$result" "['existence']['status']" "confirmed"
  assert_json_field_not_empty "existence.blockHeight is set" "$result" "['existence']['blockHeight']"

  # Authenticity
  assert_json_field "authenticity.hashMatch = true" "$result" "['authenticity']['hashMatch']" "True"
  assert_json_field_not_empty "authenticity.dataHash is set" "$result" "['authenticity']['dataHash']"
  assert_json_field_not_empty "authenticity.gatewayHash is set" "$result" "['authenticity']['gatewayHash']"

  # Owner
  assert_json_field_not_empty "owner.address is set" "$result" "['owner']['address']"

  # Metadata
  assert_json_field_not_empty "metadata.contentType is set" "$result" "['metadata']['contentType']"

  # Links
  assert_json_field_not_empty "links.pdf is set" "$result" "['links']['pdf']"
  assert_json_field_not_empty "links.dashboard is set" "$result" "['links']['dashboard']"

  # --- Cached result retrieval ---
  vid=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['verificationId'])")
  echo ""
  echo "--- Cached result retrieval (${vid}) ---"
  assert_status "GET /verify/:id returns 200" "${VERIFY_URL}/api/v1/verify/${vid}"

  cached=$(curl -s "${VERIFY_URL}/api/v1/verify/${vid}" 2>/dev/null)
  assert_json_field "Cached txId matches" "$cached" "['txId']" "$TX_SMALL"
  assert_json_field "Cached level matches" "$cached" "['level']" "$level"

  # --- Verification history ---
  echo ""
  echo "--- Verification history ---"
  history=$(curl -s "${VERIFY_URL}/api/v1/verify/tx/${TX_SMALL}" 2>/dev/null)
  assert_json_field "History txId matches" "$history" "['txId']" "$TX_SMALL"
  hist_count=$(echo "$history" | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])")
  if [[ "$hist_count" -ge 1 ]]; then
    pass "History count >= 1 (got $hist_count)"
  else
    fail "History count >= 1" "got $hist_count"
  fi

  # --- PDF certificate ---
  echo ""
  echo "--- PDF certificate ---"
  pdf_status=$(curl -s -o /dev/null -w '%{http_code}' "${VERIFY_URL}/api/v1/verify/${vid}/pdf")
  pdf_type=$(curl -s -o /dev/null -w '%{content_type}' "${VERIFY_URL}/api/v1/verify/${vid}/pdf")
  if [[ "$pdf_status" == "200" ]]; then
    pass "GET /verify/:id/pdf returns 200"
  else
    fail "GET /verify/:id/pdf returns 200" "got HTTP $pdf_status"
  fi
  if [[ "$pdf_type" == *"application/pdf"* ]]; then
    pass "PDF content-type is application/pdf"
  else
    fail "PDF content-type is application/pdf" "got $pdf_type"
  fi
fi

echo ""

# --- Verify another transaction ---
echo "--- Verify second transaction (${TX_BOOK}) ---"
result2=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"txId\":\"${TX_BOOK}\"}" \
  "${VERIFY_URL}/api/v1/verify" 2>/dev/null)

if [[ -z "$result2" || "$result2" == *"error"* ]]; then
  fail "POST /verify second tx returns result" "got: $result2"
else
  pass "POST /verify second tx returns result"
  assert_json_field "Second tx: txId matches" "$result2" "['txId']" "$TX_BOOK"
  assert_json_field "Second tx: existence confirmed" "$result2" "['existence']['status']" "confirmed"
fi

echo ""

# --- Raw data proxy ---
echo "--- Raw data proxy ---"
raw_status=$(curl -s -o /dev/null -w '%{http_code}' "${VERIFY_URL}/raw/${TX_SMALL}")
if [[ "$raw_status" == "200" ]]; then
  pass "GET /raw/:txId returns 200"
else
  fail "GET /raw/:txId returns 200" "got HTTP $raw_status"
fi

echo ""

# --- Attestation (no wallet configured) ---
echo "--- Attestation ---"
if [[ -n "${vid:-}" ]]; then
  attest_status=$(curl -s -o /dev/null -w '%{http_code}' "${VERIFY_URL}/api/v1/verify/${vid}/attestation")
  if [[ "$attest_status" == "404" ]]; then
    pass "GET /verify/:id/attestation returns 404 (no wallet configured)"
  elif [[ "$attest_status" == "200" ]]; then
    pass "GET /verify/:id/attestation returns 200 (wallet configured)"
  else
    fail "GET /verify/:id/attestation" "expected 404 or 200, got $attest_status"
  fi
fi

echo ""

# --- Summary ---
echo "============================================"
echo "Results: ${PASS} passed, ${FAIL} failed, ${TOTAL} total"
echo "============================================"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
