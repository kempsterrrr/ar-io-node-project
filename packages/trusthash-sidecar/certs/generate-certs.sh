#!/bin/bash
# Generate C2PA signing certificate chain with proper X.509 v3 extensions
# Based on c2pa-rs test certificate structure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create OpenSSL config file
cat > openssl.cnf << 'EOF'
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no

[req_distinguished_name]
CN = Trusthash Root CA
O = AR.IO
C = US

[v3_ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash

[v3_signing]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, nonRepudiation
extendedKeyUsage = critical, emailProtection
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
EOF

echo "=== Generating C2PA Certificate Chain ==="

# 1. Create Root CA
echo "1. Creating Root CA..."
openssl ecparam -name prime256v1 -genkey -noout -out root-ca-key.pem

openssl req -new -x509 -key root-ca-key.pem -out root-ca.pem -days 3650 \
  -config openssl.cnf -extensions v3_ca

# 2. Create Signing Certificate CSR
echo "2. Creating signing certificate..."
openssl ecparam -name prime256v1 -genkey -noout -out signing-key.pem

openssl req -new -key signing-key.pem -out signing.csr \
  -subj "/CN=Trusthash Signer/O=AR.IO/C=US"

# 3. Sign with Root CA (with proper extensions)
echo "3. Signing with Root CA..."
openssl x509 -req -in signing.csr -CA root-ca.pem -CAkey root-ca-key.pem \
  -CAcreateserial -out signing-cert.pem -days 365 \
  -extfile openssl.cnf -extensions v3_signing

# 4. Convert private key to PKCS#8 format (required by c2pa-node)
echo "4. Converting to PKCS#8..."
openssl pkcs8 -topk8 -nocrypt -in signing-key.pem -out private-key.pem

# 5. Create certificate chain (signing cert + root CA)
# Order matters: end-entity first, then intermediates, then root
echo "5. Creating certificate chain..."
cat signing-cert.pem root-ca.pem > certificate.pem

# 6. Verify the chain
echo "6. Verifying certificate chain..."
openssl verify -CAfile root-ca.pem signing-cert.pem

# 7. Display certificate info
echo ""
echo "=== Signing Certificate Details ==="
openssl x509 -in signing-cert.pem -noout -text | grep -A3 "X509v3 Basic Constraints\|X509v3 Key Usage\|X509v3 Extended Key Usage"

# Cleanup temporary files
rm -f signing.csr root-ca.srl signing-key.pem signing-cert.pem openssl.cnf

echo ""
echo "=== Done! Created: ==="
echo "  - certificate.pem (certificate chain: signer + root CA)"
echo "  - private-key.pem (PKCS#8 private key)"
echo "  - root-ca.pem (Root CA for trust anchors)"
echo "  - root-ca-key.pem (Root CA key - keep secure!)"
echo ""
echo "To verify c2pa-node can use these:"
echo "  bun run scripts/test-sign.ts"
