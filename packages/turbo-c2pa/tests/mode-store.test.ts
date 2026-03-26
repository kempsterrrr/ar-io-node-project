/**
 * Tests for Mode Store: preserve existing C2PA manifests.
 *
 * Uses the c2pa-node Builder to create a test image with an embedded manifest,
 * then feeds it through storeAndPrepare() to verify:
 * - Existing manifest is detected and extracted
 * - Original bytes are preserved (not re-signed)
 * - Tags are built correctly
 * - Validation results are reported
 * - Images without manifests are rejected
 */

import { describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  Builder,
  createVerifySettings,
  createTrustSettings,
  mergeSettings,
  settingsToJson,
} from '@contentauth/c2pa-node';
import { storeAndPrepare } from '../src/mode-store.js';
import { PROTOCOL_NAME } from '@ar-io/c2pa-protocol';

const CERT_DIR = path.resolve(import.meta.dir, '../../trusthash-sidecar/.dev-certs');

const hasCerts =
  fs.existsSync(path.join(CERT_DIR, 'leaf-cert.pem')) &&
  fs.existsSync(path.join(CERT_DIR, 'leaf-key-pkcs8.pem')) &&
  fs.existsSync(path.join(CERT_DIR, 'ca-cert.pem'));

const describeWithCerts = hasCerts ? describe : describe.skip;

/** Create a test JPEG with an embedded C2PA manifest. */
async function createSignedTestImage(): Promise<{
  signedBuffer: Buffer;
  caCertPem: string;
}> {
  const testImage = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 50, g: 100, b: 150 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();

  const leafCert = fs.readFileSync(path.join(CERT_DIR, 'leaf-cert.pem'));
  const caCert = fs.readFileSync(path.join(CERT_DIR, 'ca-cert.pem'));
  const leafKey = fs.readFileSync(path.join(CERT_DIR, 'leaf-key-pkcs8.pem'), 'utf-8');
  const caCertPem = caCert.toString('utf-8');

  const settings = mergeSettings(
    createTrustSettings({ verifyTrustList: false, trustAnchors: caCertPem }),
    createVerifySettings({ verifyAfterSign: false, verifyTrust: false })
  );

  const builder = Builder.withJson(
    {
      claim_generator_info: [{ name: 'test-generator', version: '1.0.0' }],
      assertions: [
        {
          label: 'c2pa.actions',
          data: { actions: [{ action: 'c2pa.created' }] },
        },
      ],
    },
    settingsToJson(settings)
  );

  const output: { buffer: Buffer | null } = { buffer: null };

  await builder.signConfigAsync(
    async (data: Buffer) =>
      Buffer.from(crypto.sign('SHA-256', data, { key: leafKey, dsaEncoding: 'ieee-p1363' })),
    {
      alg: 'es256',
      certs: [leafCert, caCert],
      reserveSize: 20480,
      directCoseHandling: false,
    },
    { buffer: testImage, mimeType: 'image/jpeg' },
    output
  );

  return { signedBuffer: output.buffer!, caCertPem };
}

describeWithCerts('Mode Store: preserve existing C2PA manifests', () => {
  let signedImage: Buffer;
  let caCertPem: string;

  it('creates a signed test image fixture', async () => {
    const result = await createSignedTestImage();
    signedImage = result.signedBuffer;
    caCertPem = result.caCertPem;
    expect(signedImage.length).toBeGreaterThan(100);
  });

  it('extracts and validates an existing C2PA manifest', async () => {
    const result = await storeAndPrepare({
      imageBuffer: signedImage,
      manifestRepoUrl: 'https://example.com/v1',
      trustAnchorPem: caCertPem,
    });

    // Manifest ID should be extracted
    expect(result.manifestId).toMatch(/^urn:c2pa:/);

    // Existing claim generator should be detected
    expect(result.existingClaimGenerator).toContain('test-generator/1.0.0');

    // Content type should be detected
    expect(result.contentType).toBe('image/jpeg');

    // pHash should be computed
    expect(result.pHashHex).toHaveLength(16);

    // Asset hash should be computed
    expect(result.assetHash.length).toBeGreaterThan(0);

    // Manifest store hash should equal asset hash (mode full — same buffer)
    expect(result.manifestStoreHash).toBe(result.assetHash);
  });

  it('preserves original bytes unchanged', async () => {
    const result = await storeAndPrepare({
      imageBuffer: signedImage,
      manifestRepoUrl: 'https://example.com/v1',
      trustAnchorPem: caCertPem,
    });

    // Original bytes must be identical
    expect(result.imageBuffer.length).toBe(signedImage.length);
    expect(Buffer.compare(result.imageBuffer, signedImage)).toBe(0);
  });

  it('builds correct ANS-104 tags', async () => {
    const result = await storeAndPrepare({
      imageBuffer: signedImage,
      manifestRepoUrl: 'https://example.com/v1',
      trustAnchorPem: caCertPem,
    });

    const findTag = (name: string) => result.tags.find((t) => t.name === name)?.value;

    expect(findTag('Protocol')).toBe(PROTOCOL_NAME);
    expect(findTag('Protocol-Version')).toBe('1.0.0');
    expect(findTag('C2PA-Storage-Mode')).toBe('full');
    expect(findTag('C2PA-Manifest-ID')).toMatch(/^urn:c2pa:/);
    expect(findTag('Content-Type')).toBe('image/jpeg');
    expect(findTag('C2PA-Soft-Binding-Alg')).toBe('org.ar-io.phash');
    expect(findTag('C2PA-Soft-Binding-Value')).toBeDefined();
    expect(findTag('C2PA-Asset-Hash')).toBeDefined();
    expect(findTag('C2PA-Manifest-Store-Hash')).toBeDefined();
    expect(findTag('C2PA-Manifest-Repo-URL')).toBe('https://example.com/v1');
    expect(result.tags.length).toBe(11);
  });

  it('reports validation status for untrusted certs', async () => {
    // Without trust anchor, the dev cert will be untrusted
    const result = await storeAndPrepare({
      imageBuffer: signedImage,
      manifestRepoUrl: 'https://example.com/v1',
      // No trustAnchorPem — cert will be untrusted
    });

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
    expect(result.validation.errors.some((e) => e.includes('untrusted'))).toBe(true);
  });

  it('reports valid when trust anchor is provided', async () => {
    const result = await storeAndPrepare({
      imageBuffer: signedImage,
      manifestRepoUrl: 'https://example.com/v1',
      trustAnchorPem: caCertPem,
    });

    expect(result.validation.valid).toBe(true);
    expect(result.validation.errors).toHaveLength(0);
  });

  it('rejects when requireValidSignature is true and validation fails', async () => {
    await expect(
      storeAndPrepare({
        imageBuffer: signedImage,
        manifestRepoUrl: 'https://example.com/v1',
        requireValidSignature: true,
        // No trustAnchorPem — will fail validation
      })
    ).rejects.toThrow('C2PA manifest failed validation');
  });

  it('rejects images without C2PA manifests', async () => {
    const plainImage = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg({ quality: 80 })
      .toBuffer();

    await expect(
      storeAndPrepare({
        imageBuffer: plainImage,
        manifestRepoUrl: 'https://example.com/v1',
      })
    ).rejects.toThrow('No C2PA manifest found');
  });

  it('rejects unsupported image formats', async () => {
    const garbage = Buffer.from('not an image at all');

    await expect(
      storeAndPrepare({
        imageBuffer: garbage,
        manifestRepoUrl: 'https://example.com/v1',
      })
    ).rejects.toThrow('Unsupported image format');
  });
});
