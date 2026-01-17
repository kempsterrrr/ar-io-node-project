import { describe, expect, it, beforeAll } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import {
  createManifest,
  readManifest,
  hasManifest,
  getClaimGenerator,
  readEmbeddedManifest,
  validateEmbeddedManifest,
} from '../src/services/c2pa.service.js';
import { generateThumbnail, computeImageHash } from '../src/services/thumbnail.service.js';
import { computePHash } from '../src/services/phash.service.js';

describe('C2PA service', () => {
  // Use real JPEG fixture for createManifest tests (c2pa-node requires valid JPEG structure)
  let fixtureImageBuffer: Buffer;
  let fixtureImageThumbnail: { buffer: Buffer; contentType: string };
  let fixtureImageHash: string;
  let fixtureImagePHash: { hex: string };

  // Synthetic image for read/validate tests only
  let syntheticImageBuffer: Buffer;

  beforeAll(async () => {
    // Load plain JPEG fixture (c2pa-sample.jpg already has manifest, can't re-sign)
    fixtureImageBuffer = await readFile(join(__dirname, 'fixtures/plain-test.jpg'));

    // Generate thumbnail for fixture
    const thumb = await generateThumbnail(fixtureImageBuffer);
    fixtureImageThumbnail = {
      buffer: thumb.buffer,
      contentType: thumb.contentType,
    };

    // Compute hashes for fixture
    fixtureImageHash = await computeImageHash(fixtureImageBuffer);
    fixtureImagePHash = await computePHash(fixtureImageBuffer);

    // Create synthetic image for read/validate tests
    syntheticImageBuffer = await sharp({
      create: {
        width: 500,
        height: 400,
        channels: 3,
        background: { r: 128, g: 64, b: 192 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
  });

  describe('createManifest', () => {
    it('creates a C2PA-compliant signed image', async () => {
      const result = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      // New API returns signed image, not JSON manifest
      expect(result.manifestBuffer).toBeDefined();
      expect(result.manifestBuffer.length).toBeGreaterThan(fixtureImageBuffer.length);
      expect(result.contentType).toBe('image/jpeg');
      expect(result.claimGenerator).toContain('Trusthash');
      expect(result.hasPriorManifest).toBe(false);

      // Verify it's a valid JPEG (magic bytes)
      expect(result.manifestBuffer[0]).toBe(0xff);
      expect(result.manifestBuffer[1]).toBe(0xd8);
    });

    it('embeds C2PA manifest in the signed image', async () => {
      const result = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      // The signed image should now have an embedded C2PA manifest
      const hasC2PA = await hasManifest(result.manifestBuffer);
      expect(hasC2PA).toBe(true);
    });

    it('manifest can be read back from signed image', async () => {
      const result = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      // Read the embedded manifest
      const readResult = await readEmbeddedManifest(result.manifestBuffer);
      expect(readResult.found).toBe(true);
      expect(readResult.manifest).toBeDefined();
      expect(readResult.manifest?.claimGenerator).toContain('Trusthash');
    });

    it('signed image passes C2PA validation', async () => {
      const result = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      // Validate the embedded manifest
      const validation = await validateEmbeddedManifest(result.manifestBuffer);
      expect(validation.verified).toBe(true);
      expect(validation.manifest).toBeDefined();
    });

    it('includes soft binding (pHash) assertion', async () => {
      const result = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      const readResult = await readEmbeddedManifest(result.manifestBuffer);
      expect(readResult.found).toBe(true);

      // Check for soft-binding assertion in the manifest
      const manifest = readResult.manifest;
      expect(manifest?.assertions).toBeDefined();

      const softBindingAssertion = manifest?.assertions?.find(
        (a) => a.label === 'c2pa.soft-binding'
      );
      expect(softBindingAssertion).toBeDefined();
    });

    it('includes ArNS identifier assertion', async () => {
      const arnsUrl = 'https://test-prov-123_mygateway.arweave.net';

      const result = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl,
      });

      const readResult = await readEmbeddedManifest(result.manifestBuffer);
      expect(readResult.found).toBe(true);

      // Check for ArNS assertion
      const manifest = readResult.manifest;
      const arnsAssertion = manifest?.assertions?.find((a) => a.label === 'ar.io.arns');
      expect(arnsAssertion).toBeDefined();
    });

    it('sets hasPriorManifest flag when prior manifest provided', async () => {
      const result = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
        priorManifest: {
          instanceId: 'urn:uuid:prior-manifest-id',
          title: 'Original Image',
          format: 'image/jpeg',
        },
      });

      expect(result.hasPriorManifest).toBe(true);
    });

    it('includes title and creator when provided', async () => {
      const result = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
        title: 'Test Image',
        creator: 'Test User',
      });

      const readResult = await readEmbeddedManifest(result.manifestBuffer);
      expect(readResult.found).toBe(true);
      expect(readResult.manifest?.title).toBe('Test Image');

      // Check for creator assertion
      const creatorAssertion = readResult.manifest?.assertions?.find(
        (a) => a.label === 'stds.schema-org.CreativeWork'
      );
      expect(creatorAssertion).toBeDefined();
    });
  });

  describe('readManifest', () => {
    it('reads embedded manifest from signed image', async () => {
      const created = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      const result = await readManifest({
        buffer: created.manifestBuffer,
        isStandalone: false,
      });

      expect(result.found).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.manifest?.claimGenerator).toContain('Trusthash');
    });

    it('returns not found for plain image without manifest', async () => {
      const result = await readManifest({
        buffer: syntheticImageBuffer,
      });

      expect(result.found).toBe(false);
    });

    it('returns not found for non-image data', async () => {
      const result = await readManifest({
        buffer: Buffer.from('not an image at all'),
        isStandalone: false,
      });

      expect(result.found).toBe(false);
    });
  });

  describe('hasManifest', () => {
    it('detects C2PA manifest in signed image', async () => {
      const created = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      expect(await hasManifest(created.manifestBuffer)).toBe(true);
    });

    it('returns false for plain image without manifest', async () => {
      expect(await hasManifest(syntheticImageBuffer)).toBe(false);
    });

    it('returns false for non-image data', async () => {
      expect(await hasManifest(Buffer.from('random data'))).toBe(false);
    });
  });

  describe('getClaimGenerator', () => {
    it('returns claim generator string', () => {
      const generator = getClaimGenerator();
      expect(generator).toContain('Trusthash');
      expect(generator).toMatch(/\d+\.\d+\.\d+/); // Version number
    });
  });

  describe('readEmbeddedManifest', () => {
    it('returns found=false for JPEG without manifest', async () => {
      const result = await readEmbeddedManifest(syntheticImageBuffer);
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
    it('validates signed image with embedded manifest', async () => {
      const created = await createManifest({
        imageBuffer: fixtureImageBuffer,
        contentType: 'image/jpeg',
        thumbnail: fixtureImageThumbnail,
        originalHash: fixtureImageHash,
        pHash: fixtureImagePHash.hex,
        arnsUrl: 'https://test-prov_mygateway.arweave.net',
      });

      const result = await validateEmbeddedManifest(created.manifestBuffer);
      expect(result.verified).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.validationStatus.errors).toHaveLength(0);
    });

    it('returns verified=false for image without manifest', async () => {
      const result = await validateEmbeddedManifest(syntheticImageBuffer);
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
});
