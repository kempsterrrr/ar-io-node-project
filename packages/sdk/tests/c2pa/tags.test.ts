import { describe, it, expect } from 'vitest';
import { buildTags } from '../../src/c2pa/tags.js';

describe('buildTags', () => {
  const baseOptions = {
    contentType: 'image/jpeg',
    manifestId: 'urn:c2pa:test-uuid',
    storageMode: 'full' as const,
    assetHash: 'abc123',
    manifestStoreHash: 'def456',
    manifestRepoUrl: 'https://example.com/v1',
  };

  it('builds required tags for all modes', () => {
    const tags = buildTags(baseOptions);

    expect(tags).toContainEqual({ name: 'Content-Type', value: 'image/jpeg' });
    expect(tags).toContainEqual({ name: 'Protocol', value: 'C2PA-Manifest-Proof' });
    expect(tags).toContainEqual({ name: 'Protocol-Version', value: '1.0.0' });
    expect(tags).toContainEqual({ name: 'C2PA-Manifest-ID', value: 'urn:c2pa:test-uuid' });
    expect(tags).toContainEqual({ name: 'C2PA-Storage-Mode', value: 'full' });
    expect(tags).toContainEqual({ name: 'C2PA-Asset-Hash', value: 'abc123' });
    expect(tags).toContainEqual({ name: 'C2PA-Manifest-Store-Hash', value: 'def456' });
    expect(tags).toContainEqual({
      name: 'C2PA-Manifest-Repo-URL',
      value: 'https://example.com/v1',
    });
    expect(tags).toHaveLength(8);
  });

  it('includes optional asset content type', () => {
    const tags = buildTags({ ...baseOptions, assetContentType: 'image/png' });
    expect(tags).toContainEqual({ name: 'C2PA-Asset-Content-Type', value: 'image/png' });
  });

  it('includes optional manifest fetch URL', () => {
    const tags = buildTags({
      ...baseOptions,
      manifestFetchUrl: 'https://example.com/fetch',
    });
    expect(tags).toContainEqual({
      name: 'C2PA-Manifest-Fetch-URL',
      value: 'https://example.com/fetch',
    });
  });

  it('includes soft binding tags when both alg and value are set', () => {
    const tags = buildTags({
      ...baseOptions,
      softBindingAlg: 'org.ar-io.phash',
      softBindingValue: 'base64value',
    });
    expect(tags).toContainEqual({ name: 'C2PA-Soft-Binding-Alg', value: 'org.ar-io.phash' });
    expect(tags).toContainEqual({ name: 'C2PA-Soft-Binding-Value', value: 'base64value' });
  });

  it('omits soft binding tags when only alg is set', () => {
    const tags = buildTags({ ...baseOptions, softBindingAlg: 'org.ar-io.phash' });
    const tagNames = tags.map((t) => t.name);
    expect(tagNames).not.toContain('C2PA-Soft-Binding-Alg');
    expect(tagNames).not.toContain('C2PA-Soft-Binding-Value');
  });

  it('includes claim generator when set', () => {
    const tags = buildTags({ ...baseOptions, claimGenerator: '@ar-io/sdk/0.1.0' });
    expect(tags).toContainEqual({ name: 'C2PA-Claim-Generator', value: '@ar-io/sdk/0.1.0' });
  });
});
