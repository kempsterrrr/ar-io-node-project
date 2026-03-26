#!/usr/bin/env bash
#
# Generate a development CA + leaf certificate chain for C2PA signing.
#
# c2pa-node requires:
# - A 2-level cert chain (CA → leaf), not self-signed
# - emailProtection EKU on the leaf cert
# - PKCS#8 format private key
#
# Output: base64-encoded PEM strings for env vars.
#
# For production, obtain a certificate from DigiCert with the
# c2pa-kp-claimSigning EKU: https://www.digicert.com/solutions/c2pa-media-trust
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/../.dev-certs"
mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"

CA_KEY="${CERT_DIR}/ca-key.pem"
CA_CERT="${CERT_DIR}/ca-cert.pem"
LEAF_KEY="${CERT_DIR}/leaf-key.pem"
LEAF_KEY_PKCS8="${CERT_DIR}/leaf-key-pkcs8.pem"
LEAF_CSR="${CERT_DIR}/leaf.csr"
LEAF_CERT="${CERT_DIR}/leaf-cert.pem"
LEAF_EXT="${CERT_DIR}/leaf-ext.cnf"
CERT_CHAIN="${CERT_DIR}/cert-chain.pem"

echo "Generating EC P-256 CA key pair..."
openssl ecparam -genkey -name prime256v1 -noout -out "$CA_KEY" 2>/dev/null

echo "Generating self-signed CA certificate (365 days)..."
openssl req -new -x509 -key "$CA_KEY" -out "$CA_CERT" -days 365 \
  -subj "/CN=C2PA Dev CA/O=AR.IO Dev" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null

echo "Generating leaf signing key..."
openssl ecparam -genkey -name prime256v1 -noout -out "$LEAF_KEY" 2>/dev/null

echo "Creating leaf CSR..."
openssl req -new -key "$LEAF_KEY" -out "$LEAF_CSR" \
  -subj "/CN=C2PA Dev Signer/O=AR.IO Dev" 2>/dev/null

echo "Signing leaf certificate with CA..."
cat > "$LEAF_EXT" << 'EXTEOF'
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=emailProtection
EXTEOF
openssl x509 -req -in "$LEAF_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$LEAF_CERT" -days 365 -extfile "$LEAF_EXT" 2>/dev/null

echo "Converting key to PKCS#8 format..."
openssl pkcs8 -topk8 -nocrypt -in "$LEAF_KEY" -out "$LEAF_KEY_PKCS8" 2>/dev/null

echo "Building certificate chain (leaf + CA)..."
cat "$LEAF_CERT" "$CA_CERT" > "$CERT_CHAIN"

# Clean up intermediates
rm -f "$LEAF_CSR" "$LEAF_EXT" "$CERT_DIR"/ca-cert.srl

echo ""
echo "Files written to ${CERT_DIR}/"
echo ""
echo "Add these to your .env file:"
echo ""

# Base64 encode for env var storage
CHAIN_B64=$(base64 < "$CERT_CHAIN" | tr -d '\n')
KEY_B64=$(base64 < "$LEAF_KEY_PKCS8" | tr -d '\n')
CA_B64=$(base64 < "$CA_CERT" | tr -d '\n')

echo "ENABLE_SIGNING=true"
echo "SIGNING_ALGORITHM=ES256"
echo "SIGNING_CERT_PEM=${CHAIN_B64}"
echo "SIGNING_PRIVATE_KEY_PEM=${KEY_B64}"
echo ""
echo "# For c2pa-node dev trust (add to SDK .env):"
echo "C2PA_TRUST_ANCHOR_PEM=${CA_B64}"

echo ""
echo "Done. These certs are for development only."
echo "  - CA cert: ${CA_CERT}"
echo "  - Leaf cert: ${LEAF_CERT}"
echo "  - Cert chain: ${CERT_CHAIN} (leaf + CA)"
echo "  - Signing key: ${LEAF_KEY_PKCS8} (PKCS#8)"
