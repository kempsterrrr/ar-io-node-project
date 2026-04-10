/**
 * Integration test for Mode 2 (manifest-only) flow.
 *
 * Tests the complete pipeline: detect → hash → phash → sign → manifest bytes → tags
 * using c2pa-node with a dev CA cert chain.
 *
 * This test signs locally (no sidecar required) to verify the SDK
 * components work together for manifest-only uploads.
 */

import { describe, expect, it } from 'vitest';
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
import { computePHash } from '../src/phash.js';
import { detectContentType } from '../src/detect.js';
import { buildTags } from '../src/tags.js';
import {
  ALG_PHASH,
  TAG_PROTOCOL,
  TAG_MANIFEST_ID,
  TAG_STORAGE_MODE,
  TAG_ASSET_CONTENT_TYPE,
  TAG_MANIFEST_STORE_HASH,
  TAG_CLAIM_GENERATOR,
  TAG_SOFT_BINDING_ALG,
  PROTOCOL_NAME,
} from '@ar-io/c2pa-protocol';

const CERT_DIR = path.resolve(import.meta.dirname, '../../trusthash-sidecar/.dev-certs');

const hasCerts =
  fs.existsSync(path.join(CERT_DIR, 'leaf-cert.pem')) &&
  fs.existsSync(path.join(CERT_DIR, 'leaf-key-pkcs8.pem')) &&
  fs.existsSync(path.join(CERT_DIR, 'ca-cert.pem'));

const describeWithCerts = hasCerts ? describe : describe.skip;

describeWithCerts('Mode 2: manifest-only (local signing)', () => {
  let testImage: Buffer;
  let leafCert: Buffer;
  let caCert: Buffer;
  let leafKey: string;

  it('loads test fixtures', async () => {
    testImage = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    leafCert = fs.readFileSync(path.join(CERT_DIR, 'leaf-cert.pem'));
    caCert = fs.readFileSync(path.join(CERT_DIR, 'ca-cert.pem'));
    leafKey = fs.readFileSync(path.join(CERT_DIR, 'leaf-key-pkcs8.pem'), 'utf-8');

    expect(testImage.length).toBeGreaterThan(100);
  });

  it('signs image and returns manifest bytes separate from signed buffer', async () => {
    const settings = mergeSettings(
      createTrustSettings({ verifyTrustList: false, trustAnchors: caCert.toString() }),
      createVerifySettings({ verifyAfterSign: false, verifyTrust: false })
    );

    const builder = Builder.withJson(
      { claim_generator_info: [{ name: 'turbo-c2pa-test', version: '0.1.0' }] },
      settingsToJson(settings)
    );

    const input = { buffer: testImage, mimeType: 'image/jpeg' };
    const output: { buffer: Buffer | null } = { buffer: null };

    const manifestBytes = await builder.signConfigAsync(
      async (data: Buffer) => {
        return Buffer.from(
          crypto.sign('SHA-256', data, { key: leafKey, dsaEncoding: 'ieee-p1363' })
        );
      },
      {
        alg: 'es256' as const,
        certs: [leafCert, caCert],
        reserveSize: 20480,
        directCoseHandling: false,
      },
      input,
      output
    );

    // manifestBytes is the raw JUMBF — distinct from the signed image
    expect(manifestBytes.length).toBeGreaterThan(0);
    expect(output.buffer).not.toBeNull();
    expect(manifestBytes.length).not.toBe(output.buffer!.length);

    // Manifest store hash is SHA-256 of manifest bytes, NOT the asset
    const manifestStoreHash = crypto.createHash('sha256').update(manifestBytes).digest('base64url');
    const assetHash = crypto.createHash('sha256').update(testImage).digest('base64url');
    expect(manifestStoreHash).not.toBe(assetHash);
  });

  it('builds correct ANS-104 tags for manifest mode', async () => {
    const phash = await computePHash(testImage);
    const assetHash = crypto.createHash('sha256').update(testImage).digest('base64url');

    const { tags } = buildTags({
      contentType: 'application/c2pa',
      manifestId: 'urn:c2pa:manifest-test-123',
      storageMode: 'manifest',
      assetHash,
      manifestStoreHash: 'c3RvcmVoYXNo',
      manifestRepoUrl: 'https://example.com/v1',
      assetContentType: 'image/jpeg',
      softBindingAlg: ALG_PHASH,
      softBindingValue: phash.base64,
      claimGenerator: 'turbo-c2pa-test/0.1.0',
    });

    const findTag = (name: string) => tags.find((t) => t.name === name)?.value;

    // Verify manifest mode specifics
    expect(findTag(TAG_PROTOCOL)).toBe(PROTOCOL_NAME);
    expect(findTag(TAG_STORAGE_MODE)).toBe('manifest');
    expect(findTag('Content-Type')).toBe('application/c2pa');
    expect(findTag(TAG_ASSET_CONTENT_TYPE)).toBe('image/jpeg');
    expect(findTag(TAG_MANIFEST_ID)).toBe('urn:c2pa:manifest-test-123');
    expect(findTag(TAG_MANIFEST_STORE_HASH)).toBe('c3RvcmVoYXNo');
    expect(findTag(TAG_SOFT_BINDING_ALG)).toBe(ALG_PHASH);
    expect(findTag(TAG_CLAIM_GENERATOR)).toBe('turbo-c2pa-test/0.1.0');
  });

  it('has correct tag count for manifest mode (12 tags)', async () => {
    const phash = await computePHash(testImage);
    const assetHash = crypto.createHash('sha256').update(testImage).digest('base64url');

    const { tags } = buildTags({
      contentType: 'application/c2pa',
      manifestId: 'urn:c2pa:test',
      storageMode: 'manifest',
      assetHash,
      manifestStoreHash: 'c3RvcmVoYXNo',
      manifestRepoUrl: 'https://example.com/v1',
      assetContentType: 'image/jpeg',
      softBindingAlg: ALG_PHASH,
      softBindingValue: phash.base64,
      claimGenerator: 'turbo-c2pa/0.1.0',
    });

    // 8 required + assetContentType + 2 softBinding + claimGenerator = 12
    expect(tags.length).toBe(12);
  });

  it('pHash is computed from original image', async () => {
    const phash = await computePHash(testImage);
    expect(phash.hex).toHaveLength(16);
    expect(phash.base64.length).toBeGreaterThan(0);
  });

  it('end-to-end: detect → hash → phash → sign → manifest bytes → tags', async () => {
    // 1. Detect
    const assetContentType = detectContentType(new Uint8Array(testImage));
    expect(assetContentType).toBe('image/jpeg');

    // 2. Asset hash
    const assetHash = crypto.createHash('sha256').update(testImage).digest('base64url');

    // 3. pHash
    const phash = await computePHash(testImage);

    // 4. Sign (produces both signed buffer and manifest bytes)
    const settings = mergeSettings(
      createTrustSettings({ verifyTrustList: false, trustAnchors: caCert.toString() }),
      createVerifySettings({ verifyAfterSign: false, verifyTrust: false })
    );

    const builder = Builder.withJson(
      { claim_generator_info: [{ name: 'turbo-c2pa', version: '0.1.0' }] },
      settingsToJson(settings)
    );

    const output: { buffer: Buffer | null } = { buffer: null };
    const manifestBytes = await builder.signConfigAsync(
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

    const manifestStoreHash = crypto.createHash('sha256').update(manifestBytes).digest('base64url');

    // 5. Tags (manifest mode)
    const manifestId = `urn:c2pa:${crypto.randomUUID()}`;
    const { tags } = buildTags({
      contentType: 'application/c2pa',
      manifestId,
      storageMode: 'manifest',
      assetHash,
      manifestStoreHash,
      manifestRepoUrl: 'https://example.com/v1',
      assetContentType: assetContentType!,
      softBindingAlg: ALG_PHASH,
      softBindingValue: phash.base64,
      claimGenerator: 'turbo-c2pa/0.1.0',
    });

    // Verify manifest mode output
    expect(manifestBytes.length).toBeGreaterThan(0);
    expect(tags.length).toBe(12); // 8 required + assetContentType + 2 binding + 1 generator
    expect(manifestId).toMatch(/^urn:c2pa:/);

    // manifestStoreHash should be hash of manifest, NOT asset
    expect(manifestStoreHash).not.toBe(assetHash);

    // Content-Type is application/c2pa (not image/jpeg)
    const contentTypeTag = tags.find((t) => t.name === 'Content-Type');
    expect(contentTypeTag?.value).toBe('application/c2pa');

    // Asset content type is preserved
    const assetCtTag = tags.find((t) => t.name === TAG_ASSET_CONTENT_TYPE);
    expect(assetCtTag?.value).toBe('image/jpeg');
  });
});
