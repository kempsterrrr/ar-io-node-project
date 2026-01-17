/**
 * Bit vector utilities for pHash operations.
 *
 * pHash is a 64-bit perceptual hash. We store it as:
 * - Binary string: "1010101010..." (64 chars of 0/1)
 * - Float array: [1.0, 0.0, 1.0, ...] (64 floats for DuckDB vss)
 * - Hex string: "a5a5a5a5a5a5a5a5" (16 hex chars)
 */

/**
 * Convert a 64-character binary string to a Float[64] array.
 * Used for storing in DuckDB for L2 distance = Hamming distance on binary vectors.
 */
export function binaryStringToFloatArray(binaryString: string): number[] {
  if (binaryString.length !== 64) {
    throw new Error(`Expected 64-bit binary string, got ${binaryString.length} bits`);
  }

  const floats: number[] = [];
  for (const bit of binaryString) {
    if (bit !== '0' && bit !== '1') {
      throw new Error(`Invalid bit character: ${bit}`);
    }
    floats.push(bit === '1' ? 1.0 : 0.0);
  }

  return floats;
}

/**
 * Convert a Float[64] array back to a binary string.
 */
export function floatArrayToBinaryString(floats: number[]): string {
  if (floats.length !== 64) {
    throw new Error(`Expected 64 floats, got ${floats.length}`);
  }

  return floats.map((f) => (f >= 0.5 ? '1' : '0')).join('');
}

/**
 * Convert a hex string to a binary string.
 * "a5" -> "10100101"
 */
export function hexToBinaryString(hex: string): string {
  const cleaned = hex.toLowerCase().replace(/^0x/, '');
  if (cleaned.length !== 16) {
    throw new Error(`Expected 16 hex characters, got ${cleaned.length}`);
  }

  let binary = '';
  for (const char of cleaned) {
    const nibble = parseInt(char, 16);
    if (isNaN(nibble)) {
      throw new Error(`Invalid hex character: ${char}`);
    }
    binary += nibble.toString(2).padStart(4, '0');
  }

  return binary;
}

/**
 * Convert a binary string to a hex string.
 * "10100101" -> "a5"
 */
export function binaryStringToHex(binaryString: string): string {
  if (binaryString.length !== 64) {
    throw new Error(`Expected 64-bit binary string, got ${binaryString.length} bits`);
  }

  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    const nibble = binaryString.slice(i, i + 4);
    hex += parseInt(nibble, 2).toString(16);
  }

  return hex;
}

/**
 * Calculate Hamming distance between two binary strings.
 * This counts the number of positions where the bits differ.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`Binary strings must have same length: ${a.length} vs ${b.length}`);
  }

  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      distance++;
    }
  }

  return distance;
}

/**
 * Calculate Hamming distance between two Float[64] arrays.
 * Treats values >= 0.5 as 1, < 0.5 as 0.
 */
export function hammingDistanceFloat(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Float arrays must have same length: ${a.length} vs ${b.length}`);
  }

  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const bitA = a[i] >= 0.5 ? 1 : 0;
    const bitB = b[i] >= 0.5 ? 1 : 0;
    if (bitA !== bitB) {
      distance++;
    }
  }

  return distance;
}

/**
 * Format pHash for display (groups of 4 bits separated by spaces).
 */
export function formatPHashForDisplay(binaryString: string): string {
  if (binaryString.length !== 64) {
    return binaryString;
  }

  const groups: string[] = [];
  for (let i = 0; i < 64; i += 8) {
    groups.push(binaryString.slice(i, i + 8));
  }

  return groups.join(' ');
}

/**
 * Validate that a string is a valid 64-bit binary pHash.
 */
export function isValidBinaryPHash(value: string): boolean {
  if (value.length !== 64) {
    return false;
  }

  for (const char of value) {
    if (char !== '0' && char !== '1') {
      return false;
    }
  }

  return true;
}

/**
 * Validate that a string is a valid 16-character hex pHash.
 */
export function isValidHexPHash(value: string): boolean {
  const cleaned = value.toLowerCase().replace(/^0x/, '');
  if (cleaned.length !== 16) {
    return false;
  }

  return /^[0-9a-f]+$/.test(cleaned);
}

/**
 * Parse a pHash from various formats into a binary string.
 * Accepts: binary string (64 chars), hex string (16 chars), or 0x-prefixed hex.
 */
export function parsePHash(value: string): string {
  const trimmed = value.trim();

  // Try binary string first
  if (isValidBinaryPHash(trimmed)) {
    return trimmed;
  }

  // Try hex string
  if (isValidHexPHash(trimmed)) {
    return hexToBinaryString(trimmed);
  }

  throw new Error(
    `Invalid pHash format. Expected 64-bit binary string or 16-character hex string, got: ${trimmed.slice(0, 20)}...`
  );
}
