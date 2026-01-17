import { describe, expect, it, beforeAll } from 'bun:test';
import sharp from 'sharp';
import {
  createManifest,
  readManifest,
  verifyManifest,
  extractThumbnail,
  hasManifest,
  getClaimGenerator,
  readEmbeddedManifest,
  validateEmbeddedManifest,
} from '../src/services/c2pa.service.js';
import { generateThumbnail, computeImageHash } from '../src/services/thumbnail.service.js';
import { computePHash } from '../src/services/phash.service.js';

describe('C2PA service', () => {
  let testImageBuffer: Buffer;
  let thumbnailResult: { buffer: Buffer; contentType: string };
  let imageHash: string;
  let pHashResult: { hex: string };

  beforeAll(async () => {
    // Create a test image
    testImageBuffer = await sharp({
      create: {
        width: 500,
        height: 400,
        channels: 3,
        background: { r: 128, g: 64, b: 192 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Generate thumbnail
    const thumb = await generateThumbnail(testImageBuffer);
    thumbnailResult = {
      buffer: thumb.buffer,
      contentType: thumb.contentType,
    };

    // Compute hashes
    imageHash = await computeImageHash(testImageBuffer);
    pHashResult = await computePHash(testImageBuffer);
  });

  describe('createManifest', () => {
    it('creates a manifest with required fields', async () => {
      const result = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      expect(result.manifestBuffer).toBeDefined();
      expect(result.manifestBuffer.length).toBeGreaterThan(0);
      expect(result.contentType).toBe('application/c2pa+json');
      expect(result.claimGenerator).toContain('Trusthash');
      expect(result.hasPriorManifest).toBe(false);
    });

    it('includes embedded thumbnail', async () => {
      const result = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      // Parse manifest to verify thumbnail
      const manifest = JSON.parse(result.manifestBuffer.toString('utf-8'));
      expect(manifest.thumbnail).toBeDefined();
      expect(manifest.assertions['c2pa.thumbnail.claim']).toBeDefined();
      expect(manifest.assertions['c2pa.thumbnail.claim'].contentType).toBe('image/jpeg');
    });

    it('includes hash assertion', async () => {
      const result = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      const manifest = JSON.parse(result.manifestBuffer.toString('utf-8'));
      expect(manifest.assertions['c2pa.hash.data']).toBeDefined();
      expect(manifest.assertions['c2pa.hash.data'].algorithm).toBe('SHA-256');
      expect(manifest.assertions['c2pa.hash.data'].hash).toBe(imageHash);
    });

    it('includes soft binding (pHash)', async () => {
      const result = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      const manifest = JSON.parse(result.manifestBuffer.toString('utf-8'));
      expect(manifest.assertions['c2pa.soft-binding']).toBeDefined();
      expect(manifest.assertions['c2pa.soft-binding'].algorithm).toBe('pHash');
      expect(manifest.assertions['c2pa.soft-binding'].value).toBe(pHashResult.hex);
    });

    it('includes ArNS identifier', async () => {
      const arnsUrl = 'https://test-prov-123_mygateway.arweave.net';

      const result = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl,
      });

      const manifest = JSON.parse(result.manifestBuffer.toString('utf-8'));
      expect(manifest.assertions['dc:identifier']).toBe(arnsUrl);
    });

    it('handles prior manifest as ingredient', async () => {
      const result = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
        priorManifest: {
          instanceId: 'urn:uuid:prior-manifest-id',
          title: 'Original Image',
          format: 'image/jpeg',
        },
      });

      expect(result.hasPriorManifest).toBe(true);

      const manifest = JSON.parse(result.manifestBuffer.toString('utf-8'));
      expect(manifest.ingredients).toHaveLength(1);
      expect(manifest.ingredients[0].instanceId).toBe('urn:uuid:prior-manifest-id');

      // Should have repackaged action
      const actions = manifest.assertions['c2pa.actions'];
      expect(actions.some((a: { action: string }) => a.action === 'c2pa.repackaged')).toBe(true);
    });

    it('includes optional title and creator', async () => {
      const result = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
        title: 'Test Image',
        creator: 'Test User',
      });

      const manifest = JSON.parse(result.manifestBuffer.toString('utf-8'));
      expect(manifest.assertions['dc:title']).toBe('Test Image');
      expect(manifest.assertions['dc:creator']).toBe('Test User');
    });
  });

  describe('readManifest', () => {
    it('reads standalone JSON manifest', async () => {
      // First create a manifest
      const created = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      // Then read it
      const result = await readManifest({
        buffer: created.manifestBuffer,
        isStandalone: true,
      });

      expect(result.found).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.manifest?.claimGenerator).toContain('Trusthash');
    });

    it('returns not found for non-manifest data', async () => {
      const result = await readManifest({
        buffer: Buffer.from('not a manifest'),
        isStandalone: true,
      });

      expect(result.found).toBe(false);
    });
  });

  describe('verifyManifest', () => {
    it('verifies valid manifest without original image', async () => {
      const created = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      const result = await verifyManifest(created.manifestBuffer);

      expect(result.verified).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.validationStatus.signatureValid).toBe(true);
      expect(result.validationStatus.hashMatch).toBeNull(); // No original provided
      expect(result.validationStatus.warnings).toContain(
        'Self-signed certificate - not verified against trusted CA'
      );
    });

    it('verifies hash when original image provided', async () => {
      const created = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      const result = await verifyManifest(created.manifestBuffer, testImageBuffer);

      expect(result.verified).toBe(true);
      expect(result.validationStatus.hashMatch).toBe(true);
    });

    it('detects hash mismatch with wrong image', async () => {
      const created = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      // Create a different image
      const differentImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await verifyManifest(created.manifestBuffer, differentImage);

      expect(result.verified).toBe(false);
      expect(result.validationStatus.hashMatch).toBe(false);
      expect(result.validationStatus.errors).toContain('Image hash does not match manifest');
    });

    it('handles invalid manifest buffer', async () => {
      const result = await verifyManifest(Buffer.from('not valid json'));

      expect(result.verified).toBe(false);
      expect(result.validationStatus.signatureValid).toBe(false);
      expect(result.validationStatus.errors.length).toBeGreaterThan(0);
    });
  });

  describe('extractThumbnail', () => {
    it('extracts embedded thumbnail', async () => {
      const created = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      const thumbnail = await extractThumbnail(created.manifestBuffer);

      expect(thumbnail).not.toBeNull();
      expect(thumbnail?.contentType).toBe('image/jpeg');
      expect(thumbnail?.data.length).toBe(thumbnailResult.buffer.length);

      // Verify JPEG magic bytes
      expect(thumbnail?.data[0]).toBe(0xff);
      expect(thumbnail?.data[1]).toBe(0xd8);
    });

    it('returns null for invalid manifest', async () => {
      const thumbnail = await extractThumbnail(Buffer.from('not a manifest'));
      expect(thumbnail).toBeNull();
    });
  });

  describe('hasManifest', () => {
    it('detects JSON manifest', async () => {
      const created = await createManifest({
        imageBuffer: testImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: thumbnailResult,
        originalHash: imageHash,
        pHash: pHashResult.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      expect(await hasManifest(created.manifestBuffer)).toBe(true);
    });

    it('returns false for non-manifest data', async () => {
      expect(await hasManifest(Buffer.from('random data'))).toBe(false);
      expect(await hasManifest(testImageBuffer)).toBe(false);
    });
  });

  describe('getClaimGenerator', () => {
    it('returns claim generator string', () => {
      const generator = getClaimGenerator();
      expect(generator).toContain('Trusthash');
      expect(generator).toMatch(/\d+\.\d+\.\d+/); // Version number
    });
  });

  describe('hasManifest - embedded detection', () => {
    it('returns false for plain JPEG without embedded manifest', async () => {
      // Create a plain JPEG without any C2PA manifest
      const plainJpeg = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
      })
        .jpeg()
        .toBuffer();

      expect(await hasManifest(plainJpeg)).toBe(false);
    });

    it('returns false for plain PNG without embedded manifest', async () => {
      // Create a plain PNG without any C2PA manifest
      const plainPng = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
      })
        .png()
        .toBuffer();

      expect(await hasManifest(plainPng)).toBe(false);
    });
  });

  describe('readEmbeddedManifest', () => {
    it('returns found=false for JPEG without manifest', async () => {
      const plainJpeg = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
      })
        .jpeg()
        .toBuffer();

      const result = await readEmbeddedManifest(plainJpeg);
      expect(result.found).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('returns found=false for PNG without manifest', async () => {
      const plainPng = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
      })
        .png()
        .toBuffer();

      const result = await readEmbeddedManifest(plainPng);
      expect(result.found).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('returns error for unsupported format', async () => {
      const randomBuffer = Buffer.from('not an image format at all');
      const result = await readEmbeddedManifest(randomBuffer);
      expect(result.found).toBe(false);
      expect(result.error).toContain('Unsupported');
    });

    it('returns error for WebP (unsupported by c2pa-ts)', async () => {
      const webpImage = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
      })
        .webp()
        .toBuffer();

      const result = await readEmbeddedManifest(webpImage);
      expect(result.found).toBe(false);
      expect(result.error).toContain('Unsupported');
    });
  });

  describe('validateEmbeddedManifest', () => {
    it('returns verified=false for image without manifest', async () => {
      const plainJpeg = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
      })
        .jpeg()
        .toBuffer();

      const result = await validateEmbeddedManifest(plainJpeg);
      expect(result.verified).toBe(false);
      expect(result.validationStatus.errors).toContain('No embedded C2PA manifest found in image');
    });

    it('returns error for unsupported format', async () => {
      const randomBuffer = Buffer.from('not an image');
      const result = await validateEmbeddedManifest(randomBuffer);
      expect(result.verified).toBe(false);
      expect(result.validationStatus.errors.some((e) => e.includes('Unsupported'))).toBe(true);
    });
  });

  describe('readManifest - embedded support', () => {
    it('returns found=false for plain image without manifest', async () => {
      const plainJpeg = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 64, g: 128, b: 192 } },
      })
        .jpeg()
        .toBuffer();

      const result = await readManifest({ buffer: plainJpeg });
      expect(result.found).toBe(false);
    });
  });
});
