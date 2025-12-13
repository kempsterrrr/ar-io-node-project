#!/bin/bash
# =============================================================================
# Gateway Test Script
# =============================================================================
# Run this script to validate the gateway is working correctly.
# Usage: ./scripts/test-gateway.sh
# =============================================================================

set -e

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
PASSED=0
FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  AR.IO Gateway Test Suite"
echo "========================================"
echo ""
echo "Testing gateway at: $GATEWAY_URL"
echo ""

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected="$3"
    
    printf "Testing %-40s " "$name..."
    
    response=$(curl -sL "$url" 2>/dev/null || echo "CURL_FAILED")
    
    if [[ "$response" == "CURL_FAILED" ]]; then
        echo -e "${RED}FAILED${NC} (connection error)"
        ((FAILED++))
        return 1
    fi
    
    if [[ "$response" == *"$expected"* ]]; then
        echo -e "${GREEN}PASSED${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        echo "  Expected: $expected"
        echo "  Got: ${response:0:100}..."
        ((FAILED++))
        return 1
    fi
}

# Test JSON endpoint
test_json_endpoint() {
    local name="$1"
    local url="$2"
    local key="$3"
    
    printf "Testing %-40s " "$name..."
    
    response=$(curl -sL "$url" 2>/dev/null || echo "CURL_FAILED")
    
    if [[ "$response" == "CURL_FAILED" ]]; then
        echo -e "${RED}FAILED${NC} (connection error)"
        ((FAILED++))
        return 1
    fi
    
    # Check if response is valid JSON and contains the key
    if echo "$response" | jq -e ".$key" > /dev/null 2>&1; then
        echo -e "${GREEN}PASSED${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        echo "  Expected JSON with key: $key"
        echo "  Got: ${response:0:100}..."
        ((FAILED++))
        return 1
    fi
}

echo "--- Connectivity Tests ---"
echo ""

# Wait for gateway to be ready
echo "Waiting for gateway to be ready..."
for i in {1..30}; do
    if curl -s "$GATEWAY_URL/ar-io/info" > /dev/null 2>&1; then
        echo "Gateway is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}Gateway not responding after 30 seconds${NC}"
        exit 1
    fi
    sleep 1
done
echo ""

echo "--- API Tests ---"
echo ""

# Run tests
test_json_endpoint "Gateway Info" "$GATEWAY_URL/ar-io/info" "processId"
test_json_endpoint "Release Info" "$GATEWAY_URL/ar-io/info" "release"
test_endpoint "Test Transaction" "$GATEWAY_URL/4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM" "test"

echo ""
echo "========================================"
echo "  Test Results"
echo "========================================"
echo ""
echo -e "  ${GREEN}Passed:${NC} $PASSED"
echo -e "  ${RED}Failed:${NC} $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi

