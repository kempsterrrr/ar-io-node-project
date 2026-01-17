import { describe, expect, it, beforeAll } from 'bun:test';
import sharp from 'sharp';
import {
  generateThumbnail,
  getImageMetadata,
  validateImage,
  computeImageHash,
} from '../src/services/thumbnail.service.js';

describe('thumbnail service', () => {
  let largeImageBuffer: Buffer;
  let smallImageBuffer: Buffer;

  beforeAll(async () => {
    // Create a large test image: 1000x800 gradient
    const gradientData = Buffer.alloc(1000 * 800 * 3);
    for (let y = 0; y < 800; y++) {
      for (let x = 0; x < 1000; x++) {
        const idx = (y * 1000 + x) * 3;
        gradientData[idx] = Math.floor((x / 1000) * 255); // R
        gradientData[idx + 1] = Math.floor((y / 800) * 255); // G
        gradientData[idx + 2] = 128; // B
      }
    }

    largeImageBuffer = await sharp(gradientData, {
      raw: { width: 1000, height: 800, channels: 3 },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Create a small test image: 200x150
    smallImageBuffer = await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
  });

  describe('generateThumbnail', () => {
    it('generates thumbnail from large image', async () => {
      const result = await generateThumbnail(largeImageBuffer);

      expect(result.contentType).toBe('image/jpeg');
      expect(result.width).toBeLessThanOrEqual(400); // Default max width
      expect(result.buffer.length).toBeLessThan(largeImageBuffer.length);
    });

    it('preserves aspect ratio', async () => {
      const result = await generateThumbnail(largeImageBuffer);

      // Original is 1000x800 (1.25 ratio)
      const ratio = result.width / result.height;
      expect(ratio).toBeCloseTo(1.25, 1);
    });

    it('respects custom max width', async () => {
      const result = await generateThumbnail(largeImageBuffer, { maxWidth: 200 });
      expect(result.width).toBeLessThanOrEqual(200);
    });

    it('respects custom quality', async () => {
      const highQuality = await generateThumbnail(largeImageBuffer, { quality: 95 });
      const lowQuality = await generateThumbnail(largeImageBuffer, { quality: 30 });

      // Lower quality should produce smaller file
      expect(lowQuality.size).toBeLessThan(highQuality.size);
    });

    it('does not enlarge small images', async () => {
      const result = await generateThumbnail(smallImageBuffer, { maxWidth: 400 });

      // Small image (200px) should not be enlarged to 400px
      expect(result.width).toBe(200);
    });

    it('produces valid JPEG output', async () => {
      const result = await generateThumbnail(largeImageBuffer);

      // Check JPEG magic bytes
      expect(result.buffer[0]).toBe(0xff);
      expect(result.buffer[1]).toBe(0xd8);
    });
  });

  describe('getImageMetadata', () => {
    it('returns correct metadata for JPEG', async () => {
      const metadata = await getImageMetadata(largeImageBuffer);

      expect(metadata.width).toBe(1000);
      expect(metadata.height).toBe(800);
      expect(metadata.format).toBe('jpeg');
      expect(metadata.hasAlpha).toBe(false);
    });

    it('returns correct size', async () => {
      const metadata = await getImageMetadata(smallImageBuffer);
      expect(metadata.size).toBe(smallImageBuffer.length);
    });

    it('handles PNG with alpha', async () => {
      const pngWithAlpha = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();

      const metadata = await getImageMetadata(pngWithAlpha);
      expect(metadata.format).toBe('png');
      expect(metadata.hasAlpha).toBe(true);
    });
  });

  describe('validateImage', () => {
    it('validates valid JPEG image', async () => {
      const result = await validateImage(largeImageBuffer);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.format).toBe('jpeg');
    });

    it('validates valid PNG image', async () => {
      const pngBuffer = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();

      const result = await validateImage(pngBuffer);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid image data', async () => {
      const invalidBuffer = Buffer.from('not an image');
      const result = await validateImage(invalidBuffer);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns size in MB', async () => {
      const result = await validateImage(largeImageBuffer);
      expect(result.metadata.sizeMB).toBeGreaterThan(0);
    });
  });

  describe('computeImageHash', () => {
    it('computes SHA-256 hash', async () => {
      const hash = await computeImageHash(largeImageBuffer);

      expect(hash).toHaveLength(64); // SHA-256 = 64 hex chars
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('produces consistent hash for same image', async () => {
      const hash1 = await computeImageHash(largeImageBuffer);
      const hash2 = await computeImageHash(largeImageBuffer);

      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different images', async () => {
      const hash1 = await computeImageHash(largeImageBuffer);
      const hash2 = await computeImageHash(smallImageBuffer);

      expect(hash1).not.toBe(hash2);
    });
  });
});
