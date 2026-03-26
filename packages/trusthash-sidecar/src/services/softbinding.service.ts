/**
 * Soft binding utilities and constants.
 */

import { ALG_PHASH, ALG_ISCC } from '@ar-io/c2pa-protocol';

export const SOFT_BINDING_ALG_PHASH = ALG_PHASH;
export const SOFT_BINDING_ALG_ISCC = ALG_ISCC;

/** Algorithms supported for exact byBinding lookup (any stored algorithm). */
export const SUPPORTED_BINDING_ALGS = [SOFT_BINDING_ALG_PHASH, SOFT_BINDING_ALG_ISCC] as const;

/** Algorithms for which we can compute a fingerprint from content (byContent). */
export const COMPUTABLE_ALGS = [SOFT_BINDING_ALG_PHASH, SOFT_BINDING_ALG_ISCC] as const;

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
