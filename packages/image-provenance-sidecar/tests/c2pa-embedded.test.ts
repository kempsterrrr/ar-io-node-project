/**
 * Integration tests for C2PA embedded manifest detection and reading.
 *
 * These tests use real C2PA images from the fixtures directory to verify
 * that the c2pa-ts integration works correctly with actual JUMBF manifests.
 */
import { describe, expect, it, beforeAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
  hasManifest,
  readManifest,
  readEmbeddedManifest,
  validateEmbeddedManifest,
} from '../src/services/c2pa.service.js';

describe('C2PA Embedded Manifest Integration', () => {
  let c2paSampleBuffer: Buffer;

  beforeAll(() => {
    // Load the C2PA sample fixture
    const fixturePath = path.join(__dirname, 'fixtures', 'c2pa-sample.jpg');
    c2paSampleBuffer = fs.readFileSync(fixturePath);
  });

  describe('hasManifest', () => {
    it('detects embedded manifest in real C2PA image', async () => {
      const result = await hasManifest(c2paSampleBuffer);
      expect(result).toBe(true);
    });
  });

  describe('readManifest', () => {
    it('reads embedded manifest from real C2PA image', async () => {
      const result = await readManifest({ buffer: c2paSampleBuffer });

      expect(result.found).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.manifest?.claimGenerator).toContain('make_test_images');
      expect(result.manifest?.assertions.length).toBeGreaterThan(0);
    });

    it('returns raw manifest metadata', async () => {
      const result = await readManifest({ buffer: c2paSampleBuffer });

      expect(result.raw).toBeDefined();
      const raw = result.raw as { type: string; mimeType: string; manifestCount: number };
      expect(raw.type).toBe('jumbf-embedded');
      expect(raw.mimeType).toBe('image/jpeg');
      expect(raw.manifestCount).toBeGreaterThan(0);
    });
  });

  describe('readEmbeddedManifest', () => {
    it('reads embedded manifest with full details', async () => {
      const result = await readEmbeddedManifest(c2paSampleBuffer);

      expect(result.found).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.manifest).toBeDefined();
    });

    it('extracts claim generator info', async () => {
      const result = await readEmbeddedManifest(c2paSampleBuffer);

      expect(result.manifest?.claimGenerator).toMatch(/make_test_images\/\d+\.\d+\.\d+/);
    });

    it('extracts assertions', async () => {
      const result = await readEmbeddedManifest(c2paSampleBuffer);

      const assertions = result.manifest?.assertions || [];
      expect(assertions.length).toBeGreaterThanOrEqual(4);

      // Check for expected assertion types
      const labels = assertions.map((a) => a.label);
      expect(labels.some((l) => l.includes('thumbnail'))).toBe(true);
      expect(labels.some((l) => l.includes('hash'))).toBe(true);
      expect(labels.some((l) => l.includes('actions'))).toBe(true);
    });

    it('categorizes assertions by kind', async () => {
      const result = await readEmbeddedManifest(c2paSampleBuffer);

      const assertions = result.manifest?.assertions || [];
      const kinds = assertions.map((a) => a.kind);

      expect(kinds).toContain('thumbnail');
      expect(kinds).toContain('hash');
      expect(kinds).toContain('actions');
    });
  });

  describe('validateEmbeddedManifest', () => {
    it('validates real C2PA manifest successfully', async () => {
      const result = await validateEmbeddedManifest(c2paSampleBuffer);

      expect(result.verified).toBe(true);
      expect(result.manifest).toBeDefined();
    });

    it('reports signature as valid', async () => {
      const result = await validateEmbeddedManifest(c2paSampleBuffer);

      expect(result.validationStatus.signatureValid).toBe(true);
    });

    it('reports hash match', async () => {
      const result = await validateEmbeddedManifest(c2paSampleBuffer);

      expect(result.validationStatus.hashMatch).toBe(true);
    });

    it('has no errors', async () => {
      const result = await validateEmbeddedManifest(c2paSampleBuffer);

      expect(result.validationStatus.errors.length).toBe(0);
    });

    it('includes certificate validation warning', async () => {
      const result = await validateEmbeddedManifest(c2paSampleBuffer);

      // We add a warning about c2pa-ts certificate chain limitations
      expect(result.validationStatus.warnings.length).toBeGreaterThan(0);
      expect(result.validationStatus.warnings.some((w) => w.includes('c2pa-ts'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles corrupted image gracefully', async () => {
      // Corrupt the image by truncating it
      const corruptedBuffer = c2paSampleBuffer.slice(0, 1000);

      const result = await readEmbeddedManifest(corruptedBuffer);

      // Should either find nothing or return an error, but not crash
      expect(result.found === false || result.error !== undefined).toBe(true);
    });

    it('handles image with stripped manifest', async () => {
      // Take just the image header (no JUMBF data)
      // JPEG header + some image data but no manifest
      const strippedBuffer = c2paSampleBuffer.slice(0, 5000);

      const result = await readEmbeddedManifest(strippedBuffer);

      // Should not find a manifest
      expect(result.found).toBe(false);
    });
  });
});
