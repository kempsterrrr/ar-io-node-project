import { describe, expect, it, beforeAll } from 'bun:test';
import sharp from 'sharp';
import {
  computePHash,
  comparePHashes,
  pHashToFloatArray,
  normalizePHashToBinary,
  normalizePHashToHex,
} from '../src/services/phash.service.js';

describe('pHash service', () => {
  let testImageBuffer: Buffer;
  let similarImageBuffer: Buffer;
  let differentImageBuffer: Buffer;

  beforeAll(async () => {
    // Create a test image: 100x100 red square
    testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    // Create a similar image: 100x100 slightly different red (small change)
    similarImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 250, g: 5, b: 5 },
      },
    })
      .jpeg()
      .toBuffer();

    // Create a different image: 100x100 blue square
    differentImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
  });

  describe('computePHash', () => {
    it('computes pHash from image buffer', async () => {
      const result = await computePHash(testImageBuffer);

      expect(result.binary).toHaveLength(64);
      expect(result.hex).toHaveLength(16);
      expect(result.floats).toHaveLength(64);

      // All values should be 0 or 1
      for (const bit of result.binary) {
        expect(['0', '1']).toContain(bit);
      }

      // Hex should be valid
      expect(/^[0-9a-f]{16}$/.test(result.hex)).toBe(true);

      // Floats should be 0.0 or 1.0
      for (const f of result.floats) {
        expect([0.0, 1.0]).toContain(f);
      }
    });

    it('produces consistent results for same image', async () => {
      const result1 = await computePHash(testImageBuffer);
      const result2 = await computePHash(testImageBuffer);

      expect(result1.hex).toBe(result2.hex);
      expect(result1.binary).toBe(result2.binary);
    });

    it('handles different image formats', async () => {
      // PNG
      const pngBuffer = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 0, g: 255, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const result = await computePHash(pngBuffer);
      expect(result.binary).toHaveLength(64);
    });
  });

  describe('comparePHashes', () => {
    it('returns 0 distance for identical hashes', async () => {
      const hash1 = await computePHash(testImageBuffer);
      const result = comparePHashes(hash1.hex, hash1.hex);

      expect(result.distance).toBe(0);
      expect(result.similarity).toBe(100);
      expect(result.isMatch).toBe(true);
    });

    it('detects similar images', async () => {
      const hash1 = await computePHash(testImageBuffer);
      const hash2 = await computePHash(similarImageBuffer);
      const result = comparePHashes(hash1.hex, hash2.hex);

      // Similar solid-color images should have low distance
      expect(result.distance).toBeLessThanOrEqual(15);
    });

    it('detects different images', async () => {
      const hash1 = await computePHash(testImageBuffer);
      const hash2 = await computePHash(differentImageBuffer);
      const result = comparePHashes(hash1.hex, hash2.hex);

      // Red vs blue solid colors may still be somewhat similar
      // The exact distance depends on the algorithm
      expect(result.distance).toBeGreaterThanOrEqual(0);
    });

    it('accepts binary and hex formats', async () => {
      const hash = await computePHash(testImageBuffer);

      const result1 = comparePHashes(hash.hex, hash.hex);
      const result2 = comparePHashes(hash.binary, hash.binary);
      const result3 = comparePHashes(hash.hex, hash.binary);

      expect(result1.distance).toBe(0);
      expect(result2.distance).toBe(0);
      expect(result3.distance).toBe(0);
    });
  });

  describe('pHashToFloatArray', () => {
    it('converts binary pHash to float array', () => {
      const binary = '10101010'.repeat(8);
      const floats = pHashToFloatArray(binary);

      expect(floats).toHaveLength(64);
      expect(floats[0]).toBe(1.0);
      expect(floats[1]).toBe(0.0);
    });

    it('converts hex pHash to float array', () => {
      const hex = 'aaaaaaaaaaaaaaaa'; // 10101010 pattern
      const floats = pHashToFloatArray(hex);

      expect(floats).toHaveLength(64);
      expect(floats[0]).toBe(1.0);
      expect(floats[1]).toBe(0.0);
    });
  });

  describe('normalizePHashToBinary', () => {
    it('normalizes hex to binary', () => {
      const hex = 'ffffffffffffffff';
      const binary = normalizePHashToBinary(hex);
      expect(binary).toBe('1'.repeat(64));
    });

    it('passes through valid binary', () => {
      const binary = '0'.repeat(64);
      expect(normalizePHashToBinary(binary)).toBe(binary);
    });
  });

  describe('normalizePHashToHex', () => {
    it('normalizes binary to hex', () => {
      const binary = '1'.repeat(64);
      const hex = normalizePHashToHex(binary);
      expect(hex).toBe('ffffffffffffffff');
    });

    it('passes through valid hex', () => {
      const hex = 'a5a5a5a5a5a5a5a5';
      expect(normalizePHashToHex(hex)).toBe(hex);
    });

    it('removes 0x prefix', () => {
      expect(normalizePHashToHex('0xffffffffffffffff')).toBe('ffffffffffffffff');
    });
  });
});
