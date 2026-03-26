/**
 * ISCC (International Standard Content Code) image code service.
 *
 * Computes io.iscc.v0 Image-Code fingerprints using @iscc/lib.
 * The Image-Code is a 64-bit DCT-based perceptual hash per ISO 24138.
 */

import sharp from 'sharp';
import { gen_image_code_v0, iscc_decode } from '@iscc/lib';
import { logger } from '../utils/logger.js';

const ISCC_THUMBNAIL_SIZE = 32;

export interface IsccResult {
  /** Full ISCC code string (e.g. "ISCC:EEA4GQZQTY6J5DTH") */
  isccCode: string;
  /** Raw 8-byte digest as base64 (suitable for soft binding value) */
  digestB64: string;
  /** Raw 8-byte digest as hex */
  digestHex: string;
}

/**
 * Compute an ISCC Image-Code from an image buffer.
 *
 * Preprocessing pipeline:
 * 1. Resize to 32×32 using bicubic interpolation
 * 2. Convert to single-channel grayscale
 * 3. Extract raw pixel data (1024 bytes)
 * 4. Pass to gen_image_code_v0 for DCT-based hashing
 */
export async function computeIsccImageCode(imageBuffer: Buffer): Promise<IsccResult> {
  try {
    const { data } = await sharp(imageBuffer)
      .resize(ISCC_THUMBNAIL_SIZE, ISCC_THUMBNAIL_SIZE, { fit: 'fill', kernel: 'cubic' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Buffer.from(data);
    const isccCode = gen_image_code_v0(pixels);
    const { digest } = iscc_decode(isccCode);

    const digestB64 = Buffer.from(digest).toString('base64');
    const digestHex = Buffer.from(digest).toString('hex');

    logger.debug(
      { isccCode, digestHex, thumbnailSize: ISCC_THUMBNAIL_SIZE },
      'Computed ISCC Image-Code'
    );

    return { isccCode, digestB64, digestHex };
  } catch (error) {
    logger.error({ error }, 'Failed to compute ISCC Image-Code');
    throw new Error(`ISCC computation failed: ${(error as Error).message}`);
  }
}
