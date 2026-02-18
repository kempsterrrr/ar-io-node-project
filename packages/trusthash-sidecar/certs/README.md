# C2PA Signing Certificates

This directory contains certificates and keys for C2PA manifest signing.

## Development Certificates

For development and testing, generate a self-signed certificate:

```bash
# Generate ECDSA P-256 key pair
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem

# Generate self-signed certificate (valid for 1 year)
openssl req -new -x509 -key private-key.pem -out certificate.pem -days 365 \
  -subj "/CN=Trusthash Development/O=AR.IO/C=US"
```

## Environment Variables

Configure the sidecar to use your certificates:

```bash
C2PA_CERT_PATH=./certs/certificate.pem
C2PA_KEY_PATH=./certs/private-key.pem
C2PA_TSA_URL=http://timestamp.digicert.com  # Optional timestamp authority
```

## Production Certificates

For images to be trusted by C2PA verifiers (Adobe Content Credentials, etc.),
you need a certificate from the [C2PA Trust List](https://c2pa.org/specifications/specifications/2.0/specs/C2PA_Specification.html#_trust_model).

### Certificate Providers

| Provider   | Contact                                                   |
| ---------- | --------------------------------------------------------- |
| DigiCert   | https://www.digicert.com/signing/c2pa-content-credentials |
| GlobalSign | https://www.globalsign.com/en/content-authenticity        |
| Entrust    | https://www.entrust.com/digital-security                  |

### Requirements

- X.509 certificate with `digitalSignature` key usage
- ECDSA P-256 or P-384 (ES256/ES384) algorithm
- Chain must root to C2PA Trust List anchor
- Certificate must include `1.3.6.1.4.1.58002.1` OID extension (C2PA signing)

## Security Notes

- **Never commit** actual certificate files to version control
- Keep private keys secure and access-controlled
- Use different certificates for development vs production
- Consider using a Hardware Security Module (HSM) for production keys
