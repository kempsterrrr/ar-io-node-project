/**
 * Perceptual hash (pHash) service using blockhash algorithm.
 *
 * Generates 64-bit perceptual hashes for images that allow similarity
 * comparison via Hamming distance.
 */

import sharp from 'sharp';
import { bmvbhash } from 'blockhash-core';
import { logger } from '../utils/logger.js';
import {
  hexToBinaryString,
  binaryStringToFloatArray,
  binaryStringToHex,
  hammingDistance,
  isValidBinaryPHash,
  isValidHexPHash,
} from '../utils/bit-vector.js';

/**
 * ImageData-like interface for blockhash-core
 */
interface ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Result of pHash computation
 */
export interface PHashResult {
  /** 64-character binary string (e.g., "1010101010...") */
  binary: string;
  /** 16-character hex string (e.g., "a5a5a5a5a5a5a5a5") */
  hex: string;
  /** Float[64] array for DuckDB storage */
  floats: number[];
}

/**
 * Compute pHash from an image buffer.
 *
 * @param imageBuffer - Raw image buffer (JPEG, PNG, WebP, etc.)
 * @returns PHashResult with binary, hex, and float representations
 */
export async function computePHash(imageBuffer: Buffer): Promise<PHashResult> {
  try {
    // Get raw RGBA pixel data using sharp
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha() // Ensure RGBA format
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Create ImageData-like object for blockhash-core
    const imageData: ImageData = {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    };

    // Compute 64-bit hash (8x8 blocks = 64 bits)
    const hexHash = bmvbhash(imageData, 8);

    // Convert to different formats
    const binaryHash = hexToBinaryString(hexHash);
    const floatArray = binaryStringToFloatArray(binaryHash);

    logger.debug({ hex: hexHash, width: info.width, height: info.height }, 'Computed pHash');

    return {
      binary: binaryHash,
      hex: hexHash,
      floats: floatArray,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to compute pHash');
    throw new Error(`pHash computation failed: ${(error as Error).message}`);
  }
}

/**
 * Compute pHash from a file path.
 *
 * @param filePath - Path to image file
 * @returns PHashResult with binary, hex, and float representations
 */
export async function computePHashFromFile(filePath: string): Promise<PHashResult> {
  const file = Bun.file(filePath);
  const buffer = Buffer.from(await file.arrayBuffer());
  return computePHash(buffer);
}

/**
 * Compare two pHashes and return similarity metrics.
 *
 * @param hash1 - First pHash (binary or hex string)
 * @param hash2 - Second pHash (binary or hex string)
 * @returns Comparison result with distance and similarity percentage
 */
export function comparePHashes(
  hash1: string,
  hash2: string
): {
  distance: number;
  similarity: number;
  isMatch: boolean;
  threshold: number;
} {
  // Normalize both hashes to binary strings
  let binary1: string;
  let binary2: string;

  if (isValidBinaryPHash(hash1)) {
    binary1 = hash1;
  } else if (isValidHexPHash(hash1)) {
    binary1 = hexToBinaryString(hash1);
  } else {
    throw new Error(`Invalid pHash format for hash1: ${hash1.slice(0, 20)}...`);
  }

  if (isValidBinaryPHash(hash2)) {
    binary2 = hash2;
  } else if (isValidHexPHash(hash2)) {
    binary2 = hexToBinaryString(hash2);
  } else {
    throw new Error(`Invalid pHash format for hash2: ${hash2.slice(0, 20)}...`);
  }

  const distance = hammingDistance(binary1, binary2);
  const similarity = ((64 - distance) / 64) * 100;

  // Default threshold: 10 bits difference = ~84% similar
  const threshold = 10;
  const isMatch = distance <= threshold;

  return {
    distance,
    similarity: Math.round(similarity * 100) / 100,
    isMatch,
    threshold,
  };
}

/**
 * Convert a pHash to Float[64] array for DuckDB storage.
 *
 * @param hash - pHash as binary or hex string
 * @returns Float[64] array
 */
export function pHashToFloatArray(hash: string): number[] {
  let binary: string;

  if (isValidBinaryPHash(hash)) {
    binary = hash;
  } else if (isValidHexPHash(hash)) {
    binary = hexToBinaryString(hash);
  } else {
    throw new Error(`Invalid pHash format: ${hash.slice(0, 20)}...`);
  }

  return binaryStringToFloatArray(binary);
}

/**
 * Format a pHash for storage as a DuckDB array literal.
 *
 * @param floats - Float[64] array
 * @returns SQL array literal string "[1.0, 0.0, ...]"
 */
export function formatFloatArrayForSQL(floats: number[]): string {
  return `[${floats.join(', ')}]`;
}

/**
 * Normalize a pHash to binary format.
 *
 * @param hash - pHash in any supported format
 * @returns 64-character binary string
 */
export function normalizePHashToBinary(hash: string): string {
  if (isValidBinaryPHash(hash)) {
    return hash;
  } else if (isValidHexPHash(hash)) {
    return hexToBinaryString(hash);
  } else {
    throw new Error(`Invalid pHash format: ${hash.slice(0, 20)}...`);
  }
}

/**
 * Normalize a pHash to hex format.
 *
 * @param hash - pHash in any supported format
 * @returns 16-character hex string
 */
export function normalizePHashToHex(hash: string): string {
  if (isValidHexPHash(hash)) {
    return hash.toLowerCase().replace(/^0x/, '');
  } else if (isValidBinaryPHash(hash)) {
    return binaryStringToHex(hash);
  } else {
    throw new Error(`Invalid pHash format: ${hash.slice(0, 20)}...`);
  }
}
