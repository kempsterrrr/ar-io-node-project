/**
 * COSE signing oracle service.
 *
 * Signs raw COSE Sig_structure payloads using a local PEM private key (dev)
 * or AWS KMS (prod, future). Returns IEEE P1363 format signatures as
 * required by COSE/C2PA.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const ALGORITHM_MAP = {
  ES256: { hash: 'SHA-256', curve: 'prime256v1', sigBytes: 64 },
  ES384: { hash: 'SHA-384', curve: 'secp384r1', sigBytes: 96 },
} as const;

/**
 * Decode a PEM string that may be stored base64-encoded in an env var.
 * Accepts either raw PEM text or base64-encoded PEM text.
 */
function decodePem(pem: string): string {
  if (pem.includes('-----BEGIN')) {
    return pem;
  }
  // Assume base64-encoded PEM (for env var storage)
  return Buffer.from(pem, 'base64').toString('utf-8');
}

/**
 * Get the decoded certificate PEM. Returns null if signing is disabled.
 */
export function getCertificatePem(): string | null {
  if (!config.ENABLE_SIGNING || !config.SIGNING_CERT_PEM) {
    return null;
  }
  return decodePem(config.SIGNING_CERT_PEM);
}

/**
 * Convert a DER-encoded ECDSA signature to IEEE P1363 format.
 *
 * DER format: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
 * P1363 format: <r padded to componentBytes> <s padded to componentBytes>
 *
 * componentBytes is 32 for P-256 (ES256) or 48 for P-384 (ES384).
 */
export function derToIeeeP1363(der: Buffer, componentBytes: number): Buffer {
  if (der[0] !== 0x30) {
    throw new Error('Invalid DER signature: expected SEQUENCE tag 0x30');
  }

  let offset = 2; // skip SEQUENCE tag and length

  // Handle multi-byte length encoding
  if (der[1] & 0x80) {
    const lenBytes = der[1] & 0x7f;
    offset = 2 + lenBytes;
  }

  // Parse r
  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected INTEGER tag 0x02 for r');
  }
  offset++;
  const rLen = der[offset];
  offset++;
  let r = der.subarray(offset, offset + rLen);
  offset += rLen;

  // Parse s
  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected INTEGER tag 0x02 for s');
  }
  offset++;
  const sLen = der[offset];
  offset++;
  let s = der.subarray(offset, offset + sLen);

  // Strip leading zero padding (DER uses leading 0x00 for positive sign)
  if (r.length > componentBytes && r[0] === 0x00) {
    r = r.subarray(r.length - componentBytes);
  }
  if (s.length > componentBytes && s[0] === 0x00) {
    s = s.subarray(s.length - componentBytes);
  }

  // Left-pad to componentBytes if shorter
  const result = Buffer.alloc(componentBytes * 2);
  r.copy(result, componentBytes - r.length);
  s.copy(result, componentBytes * 2 - s.length);

  return result;
}

/**
 * Sign a payload and return DER-encoded signature.
 * Used by directCoseHandling=true and identity assertion signing.
 */
export async function signDer(payload: Buffer): Promise<Buffer> {
  const alg = config.SIGNING_ALGORITHM as keyof typeof ALGORITHM_MAP;
  const algConfig = ALGORITHM_MAP[alg];

  if (!algConfig) {
    throw new Error(`Unsupported signing algorithm: ${alg}`);
  }

  if (!config.SIGNING_PRIVATE_KEY_PEM) {
    throw new Error('No signing key configured');
  }

  const pem = decodePem(config.SIGNING_PRIVATE_KEY_PEM);
  const derSignature = crypto.sign(algConfig.hash, payload, {
    key: pem,
    dsaEncoding: 'der',
  });

  logger.debug(
    { algorithm: config.SIGNING_ALGORITHM, signatureBytes: derSignature.length },
    'Signed payload (DER)'
  );

  return Buffer.from(derSignature);
}

/**
 * Sign a COSE Sig_structure payload using the configured private key.
 *
 * Returns the signature in IEEE P1363 format (raw r||s concatenation).
 */
export async function signCose(payload: Buffer): Promise<Buffer> {
  const alg = config.SIGNING_ALGORITHM as keyof typeof ALGORITHM_MAP;
  const algConfig = ALGORITHM_MAP[alg];

  if (!algConfig) {
    throw new Error(`Unsupported signing algorithm: ${alg}`);
  }

  if (config.SIGNING_PRIVATE_KEY_PEM) {
    return signWithPemKey(payload, algConfig);
  }

  if (config.KMS_KEY_ARN) {
    throw new Error(
      'KMS signing not yet implemented. Use SIGNING_PRIVATE_KEY_PEM for development.'
    );
  }

  throw new Error('No signing key configured');
}

function signWithPemKey(
  payload: Buffer,
  algConfig: (typeof ALGORITHM_MAP)[keyof typeof ALGORITHM_MAP]
): Buffer {
  const pem = decodePem(config.SIGNING_PRIVATE_KEY_PEM!);
  const componentBytes = algConfig.sigBytes / 2;

  // Node.js crypto.sign returns DER-encoded ECDSA signature
  const derSignature = crypto.sign(algConfig.hash, payload, {
    key: pem,
    dsaEncoding: 'der',
  });

  const p1363 = derToIeeeP1363(Buffer.from(derSignature), componentBytes);

  logger.debug(
    { algorithm: config.SIGNING_ALGORITHM, signatureBytes: p1363.length },
    'Signed COSE payload'
  );

  return p1363;
}
