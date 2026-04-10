import { describe, expect, it } from 'vitest';
import { buildTags } from '../src/tags.js';
import {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TAG_PROTOCOL,
  TAG_PROTOCOL_VERSION,
  TAG_MANIFEST_ID,
  TAG_STORAGE_MODE,
  TAG_ASSET_HASH,
  TAG_MANIFEST_STORE_HASH,
  TAG_MANIFEST_REPO_URL,
  TAG_ASSET_CONTENT_TYPE,
  TAG_MANIFEST_FETCH_URL,
  TAG_SOFT_BINDING_ALG,
  TAG_SOFT_BINDING_VALUE,
  TAG_CLAIM_GENERATOR,
  ALG_PHASH,
} from '@ar-io/c2pa-protocol';

function findTag(tags: Array<{ name: string; value: string }>, name: string): string | undefined {
  return tags.find((t) => t.name === name)?.value;
}

describe('buildTags', () => {
  const baseOptions = {
    contentType: 'application/c2pa',
    manifestId: 'urn:c2pa:test-123',
    storageMode: 'manifest' as const,
    assetHash: 'dGVzdGhhc2g',
    manifestStoreHash: 'c3RvcmVoYXNo',
    manifestRepoUrl: 'https://example.com/v1',
  };

  it('includes all required tags', () => {
    const { tags } = buildTags(baseOptions);

    expect(findTag(tags, TAG_PROTOCOL)).toBe(PROTOCOL_NAME);
    expect(findTag(tags, TAG_PROTOCOL_VERSION)).toBe(PROTOCOL_VERSION);
    expect(findTag(tags, 'Content-Type')).toBe('application/c2pa');
    expect(findTag(tags, TAG_MANIFEST_ID)).toBe('urn:c2pa:test-123');
    expect(findTag(tags, TAG_STORAGE_MODE)).toBe('manifest');
    expect(findTag(tags, TAG_ASSET_HASH)).toBe('dGVzdGhhc2g');
    expect(findTag(tags, TAG_MANIFEST_STORE_HASH)).toBe('c3RvcmVoYXNo');
    expect(findTag(tags, TAG_MANIFEST_REPO_URL)).toBe('https://example.com/v1');
  });

  it('includes soft binding tags when provided', () => {
    const { tags } = buildTags({
      ...baseOptions,
      softBindingAlg: ALG_PHASH,
      softBindingValue: 'cGhhc2h2YWx1ZQ==',
    });

    expect(findTag(tags, TAG_SOFT_BINDING_ALG)).toBe(ALG_PHASH);
    expect(findTag(tags, TAG_SOFT_BINDING_VALUE)).toBe('cGhhc2h2YWx1ZQ==');
  });

  it('omits soft binding tags when not provided', () => {
    const { tags } = buildTags(baseOptions);

    expect(findTag(tags, TAG_SOFT_BINDING_ALG)).toBeUndefined();
    expect(findTag(tags, TAG_SOFT_BINDING_VALUE)).toBeUndefined();
  });

  it('includes asset content type for mode 2/3', () => {
    const { tags } = buildTags({
      ...baseOptions,
      assetContentType: 'image/jpeg',
    });

    expect(findTag(tags, TAG_ASSET_CONTENT_TYPE)).toBe('image/jpeg');
  });

  it('includes manifest fetch URL for mode 3', () => {
    const { tags } = buildTags({
      ...baseOptions,
      storageMode: 'proof',
      manifestFetchUrl: 'https://example.com/manifest.c2pa',
    });

    expect(findTag(tags, TAG_MANIFEST_FETCH_URL)).toBe('https://example.com/manifest.c2pa');
  });

  it('includes claim generator when provided', () => {
    const { tags } = buildTags({
      ...baseOptions,
      claimGenerator: 'ArDrive C2PA/1.0',
    });

    expect(findTag(tags, TAG_CLAIM_GENERATOR)).toBe('ArDrive C2PA/1.0');
  });

  it('has correct tag count for minimal manifest mode', () => {
    const { tags } = buildTags(baseOptions);
    // 8 required tags (Content-Type + 7 protocol tags)
    expect(tags.length).toBe(8);
  });

  it('has correct tag count with all optional fields', () => {
    const { tags } = buildTags({
      ...baseOptions,
      assetContentType: 'image/jpeg',
      manifestFetchUrl: 'https://example.com/manifest.c2pa',
      softBindingAlg: ALG_PHASH,
      softBindingValue: 'cGhhc2h2YWx1ZQ==',
      claimGenerator: 'test/1.0',
    });
    // 8 required + 2 asset + 2 binding + 1 generator = 13
    expect(tags.length).toBe(13);
  });

  it('has correct tag count for manifest mode (12 tags)', () => {
    const { tags } = buildTags({
      contentType: 'application/c2pa',
      manifestId: 'urn:c2pa:test-manifest',
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

  it('has correct tag count for proof mode (13 tags)', () => {
    const { tags } = buildTags({
      contentType: 'application/json',
      manifestId: 'urn:c2pa:test-proof',
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
});
