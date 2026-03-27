import { createHash } from 'node:crypto';

/**
 * Derive an Arweave wallet address from an owner public key.
 * Address = base64url(SHA-256(base64url_decode(owner)))
 */
export function ownerToAddress(ownerB64Url: string): string {
  const ownerBytes = base64UrlToBuffer(ownerB64Url);
  const hash = createHash('sha256').update(ownerBytes).digest();
  return bufferToBase64Url(hash);
}

/**
 * Compute SHA-256 hash of a buffer, returned as base64url.
 */
export function sha256B64Url(data: Buffer | Uint8Array): string {
  const hash = createHash('sha256').update(data).digest();
  return bufferToBase64Url(hash);
}

export function base64UrlToBuffer(b64url: string): Buffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

export function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
