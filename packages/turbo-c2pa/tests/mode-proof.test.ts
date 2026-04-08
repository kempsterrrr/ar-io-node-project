/**
 * Unit tests for Mode 3 (proof-locator) flow.
 *
 * Tests proof-locator creation: tag generation, proof payload structure,
 * hash computation, error handling. No sidecar required.
 */

import { describe, expect, it, beforeAll, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { extractProvenanceUrl } from '../src/xmp.js';
import { computePHash } from '../src/phash.js';
import { detectContentType } from '../src/detect.js';
import { buildTags } from '../src/tags.js';
import { proofAndPrepare } from '../src/mode-proof.js';
import {
  ALG_PHASH,
  TAG_PROTOCOL,
  TAG_MANIFEST_ID,
  TAG_STORAGE_MODE,
  TAG_ASSET_CONTENT_TYPE,
  TAG_MANIFEST_FETCH_URL,
  TAG_MANIFEST_STORE_HASH,
  TAG_CLAIM_GENERATOR,
  TAG_SOFT_BINDING_ALG,
  TAG_SOFT_BINDING_VALUE,
  PROTOCOL_NAME,
} from '@ar-io/c2pa-protocol';

describe('Mode 3: proof-locator', () => {
  let testImage: Buffer;

  beforeAll(async () => {
    testImage = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
  });

  it('produces correct tags with storageMode="proof"', async () => {
    const result = await proofAndPrepare({
      imageBuffer: testImage,
      manifestFetchUrl: 'https://cai-store.adobe.com/manifest/urn:c2pa:test-123',
      manifestId: 'urn:c2pa:test-123',
      manifestRepoUrl: 'https://example.com/v1',
      manifestStoreHash: 'dGVzdGhhc2g',
      fetchAndVerifyManifest: false,
    });

    const findTag = (name: string) => result.tags.find((t) => t.name === name)?.value;

    expect(findTag(TAG_PROTOCOL)).toBe(PROTOCOL_NAME);
    expect(findTag(TAG_STORAGE_MODE)).toBe('proof');
    expect(findTag('Content-Type')).toBe('application/json');
    expect(findTag(TAG_ASSET_CONTENT_TYPE)).toBe('image/jpeg');
    expect(findTag(TAG_MANIFEST_FETCH_URL)).toBe(
      'https://cai-store.adobe.com/manifest/urn:c2pa:test-123'
    );
    expect(findTag(TAG_MANIFEST_STORE_HASH)).toBe('dGVzdGhhc2g');
    expect(findTag(TAG_MANIFEST_ID)).toBe('urn:c2pa:test-123');
  });

  it('returns a parseable JSON proof payload', async () => {
    const result = await proofAndPrepare({
      imageBuffer: testImage,
      manifestFetchUrl: 'https://cai-store.adobe.com/manifest/urn:c2pa:test-123',
      manifestId: 'urn:c2pa:test-123',
      manifestRepoUrl: 'https://example.com/v1',
      manifestStoreHash: 'dGVzdGhhc2g',
      fetchAndVerifyManifest: false,
    });

    const payload = JSON.parse(result.proofPayload.toString());
    expect(payload.type).toBe('c2pa-proof-locator');
    expect(payload.manifestFetchUrl).toBe('https://cai-store.adobe.com/manifest/urn:c2pa:test-123');
    expect(payload.manifestStoreHash).toBe('dGVzdGhhc2g');
    expect(payload.manifestId).toBe('urn:c2pa:test-123');
    expect(payload.assetHash).toBeTruthy();
  });

  it('accepts caller-provided manifestStoreHash', async () => {
    const result = await proofAndPrepare({
      imageBuffer: testImage,
      manifestFetchUrl: 'https://example.com/manifest',
      manifestId: 'urn:c2pa:test-456',
      manifestRepoUrl: 'https://example.com/v1',
      manifestStoreHash: 'Y2FsbGVyLXByb3ZpZGVk',
      fetchAndVerifyManifest: false,
    });

    expect(result.manifestStoreHash).toBe('Y2FsbGVyLXByb3ZpZGVk');
    const findTag = (name: string) => result.tags.find((t) => t.name === name)?.value;
    expect(findTag(TAG_MANIFEST_STORE_HASH)).toBe('Y2FsbGVyLXByb3ZpZGVk');
  });

  it('throws if manifestFetchUrl is missing', async () => {
    await expect(
      proofAndPrepare({
        imageBuffer: testImage,
        manifestFetchUrl: '',
        manifestId: 'urn:c2pa:test-789',
        manifestRepoUrl: 'https://example.com/v1',
        manifestStoreHash: 'dGVzdA',
        fetchAndVerifyManifest: false,
      })
    ).rejects.toThrow('manifestFetchUrl is required');
  });

  it('throws if manifestId is missing', async () => {
    await expect(
      proofAndPrepare({
        imageBuffer: testImage,
        manifestFetchUrl: 'https://example.com/manifest',
        manifestId: '',
        manifestRepoUrl: 'https://example.com/v1',
        manifestStoreHash: 'dGVzdA',
        fetchAndVerifyManifest: false,
      })
    ).rejects.toThrow('manifestId is required');
  });

  it('throws if no manifestStoreHash and fetchAndVerifyManifest is false', async () => {
    await expect(
      proofAndPrepare({
        imageBuffer: testImage,
        manifestFetchUrl: 'https://example.com/manifest',
        manifestId: 'urn:c2pa:test-000',
        manifestRepoUrl: 'https://example.com/v1',
        fetchAndVerifyManifest: false,
      })
    ).rejects.toThrow('manifestStoreHash is required when fetchAndVerifyManifest is false');
  });

  it('has correct tag count for proof mode (13 tags)', async () => {
    const result = await proofAndPrepare({
      imageBuffer: testImage,
      manifestFetchUrl: 'https://example.com/manifest',
      manifestId: 'urn:c2pa:test-count',
      manifestRepoUrl: 'https://example.com/v1',
      manifestStoreHash: 'dGVzdA',
      fetchAndVerifyManifest: false,
    });

    // 8 required + assetContentType + manifestFetchUrl + 2 softBinding + claimGenerator = 13
    expect(result.tags.length).toBe(13);
  });

  it('pHash is computed from original image', async () => {
    const result = await proofAndPrepare({
      imageBuffer: testImage,
      manifestFetchUrl: 'https://example.com/manifest',
      manifestId: 'urn:c2pa:test-phash',
      manifestRepoUrl: 'https://example.com/v1',
      manifestStoreHash: 'dGVzdA',
      fetchAndVerifyManifest: false,
    });

    expect(result.pHashHex).toHaveLength(16);
    expect(result.assetContentType).toBe('image/jpeg');
  });

  it('contentType is always application/json', async () => {
    const result = await proofAndPrepare({
      imageBuffer: testImage,
      manifestFetchUrl: 'https://example.com/manifest',
      manifestId: 'urn:c2pa:test-ct',
      manifestRepoUrl: 'https://example.com/v1',
      manifestStoreHash: 'dGVzdA',
      fetchAndVerifyManifest: false,
    });

    expect(result.contentType).toBe('application/json');
  });
});

const FIXTURE_DIR = path.resolve(import.meta.dirname, 'fixtures');
const cloudJpgPath = path.join(FIXTURE_DIR, 'cloud.jpg');
const hasCloudFixture = fs.existsSync(cloudJpgPath);
const describeWithFixture = hasCloudFixture ? describe : describe.skip;

describeWithFixture('Mode 3: proof-locator with real Adobe-signed image (cloud.jpg)', () => {
  let cloudImage: Buffer;
  let extractedUrl: string;

  beforeAll(() => {
    cloudImage = fs.readFileSync(cloudJpgPath);
    const url = extractProvenanceUrl(cloudImage);
    if (!url) throw new Error('cloud.jpg missing dcterms:provenance — fixture may be wrong');
    extractedUrl = url;
  });

  it('creates proof-locator using URL extracted from XMP', async () => {
    const result = await proofAndPrepare({
      imageBuffer: cloudImage,
      manifestFetchUrl: extractedUrl,
      manifestId: 'adobe:urn:uuid:5f37e182-3687-462e-a7fb-573462780391',
      manifestRepoUrl: 'https://example.com/v1',
      manifestStoreHash: 'placeholder-hash',
      fetchAndVerifyManifest: false,
    });

    const findTag = (name: string) => result.tags.find((t) => t.name === name)?.value;

    expect(findTag(TAG_STORAGE_MODE)).toBe('proof');
    expect(findTag('Content-Type')).toBe('application/json');
    expect(findTag(TAG_MANIFEST_ID)).toBe('adobe:urn:uuid:5f37e182-3687-462e-a7fb-573462780391');
    expect(findTag(TAG_MANIFEST_FETCH_URL)).toContain('cai-manifests.adobe.com');
    expect(findTag(TAG_ASSET_CONTENT_TYPE)).toBe('image/jpeg');
    expect(result.pHashHex).toHaveLength(16);
    expect(result.tags.length).toBe(13);
  });

  it('auto-detects manifestFetchUrl from XMP when not provided', async () => {
    const result = await proofAndPrepare({
      imageBuffer: cloudImage,
      // manifestFetchUrl omitted — should auto-detect from XMP dcterms:provenance
      manifestId: 'adobe:urn:uuid:5f37e182-3687-462e-a7fb-573462780391',
      manifestRepoUrl: 'https://example.com/v1',
      manifestStoreHash: 'placeholder-hash',
      fetchAndVerifyManifest: false,
    });

    expect(result.manifestFetchUrl).toBe(extractedUrl);
    expect(result.manifestFetchUrl).toContain('cai-manifests.adobe.com');
  });
});

describe('Mode 3: proof-locator tag builder', () => {
  it('has correct tag count for proof mode with all fields', () => {
    const { tags } = buildTags({
      contentType: 'application/json',
      manifestId: 'urn:c2pa:proof-test',
      storageMode: 'proof',
      assetHash: 'dGVzdGhhc2g',
      manifestStoreHash: 'c3RvcmVoYXNo',
      manifestRepoUrl: 'https://example.com/v1',
      assetContentType: 'image/jpeg',
      manifestFetchUrl: 'https://example.com/manifest',
      softBindingAlg: ALG_PHASH,
      softBindingValue: 'cGhhc2h2YWx1ZQ==',
      claimGenerator: 'turbo-c2pa/0.1.0',
    });

    // 8 required + assetContentType + manifestFetchUrl + 2 binding + 1 generator = 13
    expect(tags.length).toBe(13);
  });

  it('has correct tag count for manifest mode with all fields', () => {
    const { tags } = buildTags({
      contentType: 'application/c2pa',
      manifestId: 'urn:c2pa:manifest-test',
      storageMode: 'manifest',
      assetHash: 'dGVzdGhhc2g',
      manifestStoreHash: 'c3RvcmVoYXNo',
      manifestRepoUrl: 'https://example.com/v1',
      assetContentType: 'image/jpeg',
      softBindingAlg: ALG_PHASH,
      softBindingValue: 'cGhhc2h2YWx1ZQ==',
      claimGenerator: 'turbo-c2pa/0.1.0',
    });

    // 8 required + assetContentType + 2 binding + 1 generator = 12
    expect(tags.length).toBe(12);
  });
});
