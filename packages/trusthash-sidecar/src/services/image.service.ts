/**
 * Image validation utilities.
 */

import sharp from 'sharp';
import { config } from '../config.js';

/**
 * Validate image dimensions and size.
 *
 * @param imageBuffer - Image buffer
 * @returns Validation result
 */
export async function validateImage(imageBuffer: Buffer): Promise<{
  valid: boolean;
  errors: string[];
  metadata: {
    width: number;
    height: number;
    format: string;
    sizeMB: number;
  };
}> {
  const errors: string[] = [];
  const sizeMB = imageBuffer.length / (1024 * 1024);

  try {
    const metadata = await sharp(imageBuffer).metadata();

    // Check size limit
    if (sizeMB > config.MAX_IMAGE_SIZE_MB) {
      errors.push(
        `Image size ${sizeMB.toFixed(2)}MB exceeds limit of ${config.MAX_IMAGE_SIZE_MB}MB`
      );
    }

    // Check format
    const supportedFormats = ['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif', 'heif'];
    if (metadata.format && !supportedFormats.includes(metadata.format)) {
      errors.push(`Unsupported image format: ${metadata.format}`);
    }

    // Check dimensions
    if (!metadata.width || !metadata.height) {
      errors.push('Could not determine image dimensions');
    }

    return {
      valid: errors.length === 0,
      errors,
      metadata: {
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        format: metadata.format ?? 'unknown',
        sizeMB: Math.round(sizeMB * 100) / 100,
      },
    };
  } catch (error) {
    errors.push(`Invalid image: ${(error as Error).message}`);
    return {
      valid: false,
      errors,
      metadata: {
        width: 0,
        height: 0,
        format: 'unknown',
        sizeMB: Math.round(sizeMB * 100) / 100,
      },
    };
  }
}
