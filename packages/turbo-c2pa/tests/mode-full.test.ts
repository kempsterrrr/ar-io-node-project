/**
 * Integration test for Mode 1 (full embed) flow.
 *
 * Tests the complete pipeline: detect → hash → phash → sign → tags
 * using c2pa-node with a dev CA cert chain.
 *
 * This test signs locally (no sidecar required) to verify the SDK
 * components work together.
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
import { computePHash } from '../src/phash.js';
import { detectContentType } from '../src/detect.js';
import { buildTags } from '../src/tags.js';
import {
  ALG_PHASH,
  TAG_PROTOCOL,
  TAG_MANIFEST_ID,
  TAG_STORAGE_MODE,
  PROTOCOL_NAME,
} from '@ar-io/c2pa-protocol';

const CERT_DIR = path.resolve(import.meta.dir, '../../trusthash-sidecar/.dev-certs');

const hasCerts =
  fs.existsSync(path.join(CERT_DIR, 'leaf-cert.pem')) &&
  fs.existsSync(path.join(CERT_DIR, 'leaf-key-pkcs8.pem')) &&
  fs.existsSync(path.join(CERT_DIR, 'ca-cert.pem'));

const describeWithCerts = hasCerts ? describe : describe.skip;

describeWithCerts('Mode 1: full embed (local signing)', () => {
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

  it('detects content type from image buffer', () => {
    const ct = detectContentType(new Uint8Array(testImage));
    expect(ct).toBe('image/jpeg');
  });

  it('computes pHash from image buffer', async () => {
    const result = await computePHash(testImage);
    expect(result.hex).toHaveLength(16);
    expect(result.base64.length).toBeGreaterThan(0);
  });

  it('signs image with c2pa-node and embeds manifest', async () => {
    const settings = mergeSettings(
      createTrustSettings({ verifyTrustList: false, trustAnchors: caCert.toString() }),
      createVerifySettings({ verifyAfterSign: false, verifyTrust: false })
    );

    const builder = Builder.withJson(
      { claim_generator_info: [{ name: 'turbo-c2pa-test', version: '0.1.0' }] },
      settingsToJson(settings)
    );

    const signerConfig = {
      alg: 'es256' as const,
      certs: [leafCert, caCert],
      reserveSize: 20480,
      directCoseHandling: false,
    };

    const input = { buffer: testImage, mimeType: 'image/jpeg' };
    const output: { buffer: Buffer | null } = { buffer: null };

    const manifestBytes = await builder.signConfigAsync(
      async (data: Buffer) => {
        return Buffer.from(
          crypto.sign('SHA-256', data, { key: leafKey, dsaEncoding: 'ieee-p1363' })
        );
      },
      signerConfig,
      input,
      output
    );

    expect(output.buffer).not.toBeNull();
    expect(output.buffer!.length).toBeGreaterThan(testImage.length);
    expect(manifestBytes.length).toBeGreaterThan(0);

    // Compute manifest store hash
    const hash = crypto.createHash('sha256').update(manifestBytes).digest();
    const manifestStoreHash = hash
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(manifestStoreHash.length).toBeGreaterThan(0);
  });

  it('builds correct ANS-104 tags for Mode 1', async () => {
    const phash = await computePHash(testImage);
    const assetHash = crypto
      .createHash('sha256')
      .update(testImage)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const { tags } = buildTags({
      contentType: 'image/jpeg',
      manifestId: 'urn:c2pa:test-123',
      storageMode: 'full',
      assetHash,
      manifestStoreHash: 'dGVzdGhhc2g',
      manifestRepoUrl: 'https://example.com/v1',
      softBindingAlg: ALG_PHASH,
      softBindingValue: phash.base64,
      claimGenerator: 'turbo-c2pa-test/0.1.0',
    });

    const findTag = (name: string) => tags.find((t) => t.name === name)?.value;

    expect(findTag(TAG_PROTOCOL)).toBe(PROTOCOL_NAME);
    expect(findTag(TAG_STORAGE_MODE)).toBe('full');
    expect(findTag(TAG_MANIFEST_ID)).toBe('urn:c2pa:test-123');
    expect(findTag('Content-Type')).toBe('image/jpeg');
  });

  it('end-to-end: detect → hash → phash → sign → tags', async () => {
    // 1. Detect
    const contentType = detectContentType(new Uint8Array(testImage));
    expect(contentType).toBe('image/jpeg');

    // 2. Asset hash
    const assetHash = crypto.createHash('sha256').update(testImage).digest('base64url');

    // 3. pHash
    const phash = await computePHash(testImage);

    // 4. Sign
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

    // 5. Tags
    const manifestId = `urn:c2pa:${crypto.randomUUID()}`;
    const { tags } = buildTags({
      contentType: contentType!,
      manifestId,
      storageMode: 'full',
      assetHash,
      manifestStoreHash,
      manifestRepoUrl: 'https://example.com/v1',
      softBindingAlg: ALG_PHASH,
      softBindingValue: phash.base64,
      claimGenerator: 'turbo-c2pa/0.1.0',
    });

    // Verify
    expect(output.buffer!.length).toBeGreaterThan(testImage.length);
    expect(tags.length).toBe(11); // 8 required + 2 binding + 1 claim generator
    expect(manifestId).toMatch(/^urn:c2pa:/);

    // The signed image should still be valid JPEG
    const signedMeta = await sharp(output.buffer!).metadata();
    expect(signedMeta.format).toBe('jpeg');
    expect(signedMeta.width).toBe(200);
    expect(signedMeta.height).toBe(200);
  });
});
