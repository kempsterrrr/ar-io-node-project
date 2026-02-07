/**
 * Soft binding utilities and constants.
 */

export const SOFT_BINDING_ALG_ID = 'org.ar-io.phash';

/**
 * Convert pHash hex string (64-bit, 16 hex chars) into soft binding bytes.
 */
export function pHashHexToSoftBindingBytes(pHashHex: string): Buffer {
  return Buffer.from(pHashHex, 'hex');
}

/**
 * Convert pHash hex string to base64-encoded soft binding value.
 */
export function pHashHexToSoftBindingValue(pHashHex: string): string {
  return pHashHexToSoftBindingBytes(pHashHex).toString('base64');
}

/**
 * Convert base64-encoded soft binding value to pHash hex string.
 */
export function softBindingValueToPHashHex(valueB64: string): string {
  return Buffer.from(valueB64, 'base64').toString('hex');
}
