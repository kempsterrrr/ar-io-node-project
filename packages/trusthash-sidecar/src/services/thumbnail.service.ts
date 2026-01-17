/**
 * Thumbnail generation service using sharp.
 *
 * Generates compressed JPEG thumbnails for embedding in C2PA manifests.
 * Thumbnails are designed to be small (~20-50KB) while maintaining
 * reasonable visual quality for verification purposes.
 */

import sharp from 'sharp';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Result of thumbnail generation
 */
export interface ThumbnailResult {
  /** Thumbnail image buffer (JPEG format) */
  buffer: Buffer;
  /** MIME type (always image/jpeg for thumbnails) */
  contentType: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Size in bytes */
  size: number;
}

/**
 * Options for thumbnail generation
 */
export interface ThumbnailOptions {
  /** Maximum width in pixels (default from config) */
  maxWidth?: number;
  /** JPEG quality 1-100 (default from config) */
  quality?: number;
  /** Whether to preserve aspect ratio (default: true) */
  preserveAspectRatio?: boolean;
}

/**
 * Generate a thumbnail from an image buffer.
 *
 * @param imageBuffer - Original image buffer
 * @param options - Optional thumbnail generation options
 * @returns ThumbnailResult with buffer and metadata
 */
export async function generateThumbnail(
  imageBuffer: Buffer,
  options?: ThumbnailOptions
): Promise<ThumbnailResult> {
  const maxWidth = options?.maxWidth ?? config.THUMBNAIL_WIDTH;
  const quality = options?.quality ?? config.THUMBNAIL_QUALITY;
  const preserveAspectRatio = options?.preserveAspectRatio ?? true;

  try {
    // Get original image metadata
    const metadata = await sharp(imageBuffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine image dimensions');
    }

    // Calculate target dimensions
    let targetWidth = maxWidth;
    let targetHeight: number | undefined;

    if (preserveAspectRatio) {
      // Only resize if image is wider than max width
      if (metadata.width <= maxWidth) {
        targetWidth = metadata.width;
      }
      // Height will be calculated automatically to preserve aspect ratio
    } else {
      // Fixed dimensions (may distort image)
      targetHeight = Math.round(maxWidth * (metadata.height / metadata.width));
    }

    // Generate thumbnail
    const result = await sharp(imageBuffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: preserveAspectRatio ? 'inside' : 'fill',
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        progressive: true,
        mozjpeg: true, // Better compression
      })
      .toBuffer({ resolveWithObject: true });

    logger.debug(
      {
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        thumbnailWidth: result.info.width,
        thumbnailHeight: result.info.height,
        size: result.data.length,
        quality,
      },
      'Generated thumbnail'
    );

    return {
      buffer: result.data,
      contentType: 'image/jpeg',
      width: result.info.width,
      height: result.info.height,
      size: result.data.length,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to generate thumbnail');
    throw new Error(`Thumbnail generation failed: ${(error as Error).message}`);
  }
}

/**
 * Generate a thumbnail from a file path.
 *
 * @param filePath - Path to image file
 * @param options - Optional thumbnail generation options
 * @returns ThumbnailResult with buffer and metadata
 */
export async function generateThumbnailFromFile(
  filePath: string,
  options?: ThumbnailOptions
): Promise<ThumbnailResult> {
  const file = Bun.file(filePath);
  const buffer = Buffer.from(await file.arrayBuffer());
  return generateThumbnail(buffer, options);
}

/**
 * Get image metadata without generating thumbnail.
 *
 * @param imageBuffer - Image buffer
 * @returns Image metadata
 */
export async function getImageMetadata(imageBuffer: Buffer): Promise<{
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
}> {
  const metadata = await sharp(imageBuffer).metadata();

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? 'unknown',
    size: imageBuffer.length,
    hasAlpha: metadata.hasAlpha ?? false,
  };
}

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

/**
 * Compute SHA-256 hash of image buffer.
 *
 * @param imageBuffer - Image buffer
 * @returns Hex-encoded SHA-256 hash
 */
export async function computeImageHash(imageBuffer: Buffer): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(imageBuffer);
  return hasher.digest('hex');
}
