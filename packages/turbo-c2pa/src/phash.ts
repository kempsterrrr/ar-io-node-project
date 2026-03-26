/**
 * Perceptual hash (pHash) computation for images.
 *
 * Uses blockhash algorithm (8x8 blocks = 64-bit hash) for image similarity.
 * The hash is used as the C2PA soft binding value.
 */

import sharp from 'sharp';
import { bmvbhash } from 'blockhash-core';

interface ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PHashResult {
  /** 16-character hex string (e.g., "a5a5a5a5a5a5a5a5"). */
  hex: string;
  /** base64-encoded 8-byte hash (for C2PA-Soft-Binding-Value tag). */
  base64: string;
}

/**
 * Compute a 64-bit perceptual hash from an image buffer.
 */
export async function computePHash(imageBuffer: Buffer): Promise<PHashResult> {
  const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });

  const imageData: ImageData = {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data),
  };

  const hex: string = bmvbhash(imageData, 8);
  const base64 = Buffer.from(hex, 'hex').toString('base64');

  return { hex, base64 };
}
