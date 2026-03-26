# C2PA Production Readiness

Items required before the C2PA signing and repository services can be used externally. These are tracked but intentionally deferred while the system is in testing.

## Signing Certificate (B1)

**Current state**: Self-signed dev CA + leaf certificate (ES256/P-256). Generated via `packages/trusthash-sidecar/certs/generate-certs.sh`. These certs will cause every manifest to fail trust verification in standard C2PA validators (Adobe Content Credentials, contentcredentials.org).

**Required for production**:

- X.509 v3 end-entity certificate from a C2PA Trust List provider (DigiCert, GlobalSign, Entrust)
- Must include C2PA OID extension: `1.3.6.1.4.1.58002.1`
- `digitalSignature` in Key Usage
- Extended Key Usage present and non-empty (`anyExtendedKeyUsage` must NOT be present)
- `cA` boolean NOT asserted in Basic Constraints
- Full chain: end-entity cert + intermediate CA(s) + root

**Configuration**: Set `SIGNING_CERT_PEM` and `SIGNING_PRIVATE_KEY_PEM` in the sidecar environment with the production cert chain and key.

## RFC 3161 Trusted Timestamp (B2)

**Current state**: Not implemented. No TSA integration in the signing service.

**Required for production**:

- Embed an RFC 3161 timestamp from a TSA in every COSE signature
- This proves when the signing occurred, independent of the signer's clock
- C2PA validators will flag manifests without timestamps as having unverifiable time claims

**Implementation path**: Add `C2PA_TSA_URL` config to the sidecar, integrate with c2pa-node's TSA support during signing.

## OCSP Stapling (B2)

**Current state**: Not implemented. No OCSP responder integration.

**Required for production**:

- Staple an OCSP response into each COSE signature
- Proves the signing certificate was not revoked at signing time
- Required by C2PA spec alongside TSA for full trust verification

**Implementation path**: Fetch OCSP response from the certificate's OCSP responder URL during signing, embed in the COSE unprotected header.

## SBAL Registration (A5)

**Current state**: Draft ready at `docs/sbal-registration.md` but not submitted. Using unregistered `org.ar-io.phash` algorithm violates a SHALL-level requirement in C2PA spec Section 1.3.

**Required for production**: Submit the SBAL registration PR to the C2PA specifications repository.

## Summary

| Item                    | Blocker for                 | Status                            |
| ----------------------- | --------------------------- | --------------------------------- |
| Production signing cert | External trust verification | Deferred — testing with dev certs |
| RFC 3161 TSA            | Timestamp trust             | Not implemented                   |
| OCSP stapling           | Revocation proof            | Not implemented                   |
| SBAL registration       | Spec compliance             | Draft ready, not submitted        |

These items do not affect the repository path (storing pre-signed content from customers who have their own signing infrastructure). They only affect the signing path (creating new manifests on behalf of customers).
