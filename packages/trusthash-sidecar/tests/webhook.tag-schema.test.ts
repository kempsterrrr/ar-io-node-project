/**
 * Tests for webhook tag schema processing.
 *
 * Verifies that processWebhook() correctly handles the C2PA-Manifest-Proof
 * tag schema and rejects legacy tags.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the database module before importing webhook service
const mockGetManifestByTxId = vi.fn(() => Promise.resolve(null));
const mockUpsertManifestArtifactWithBindings = vi.fn(() => Promise.resolve());

vi.mock('../src/db/index.js', () => ({
  getManifestByTxId: mockGetManifestByTxId,
  upsertManifestArtifactWithBindings: mockUpsertManifestArtifactWithBindings,
}));

import { processWebhook, type WebhookPayload } from '../src/services/webhook.service.js';

afterEach(() => {
  mockGetManifestByTxId.mockClear();
  mockUpsertManifestArtifactWithBindings.mockClear();
});

function buildPayload(
  txId: string,
  tags: Array<{ name: string; value: string }>,
  extra?: Partial<WebhookPayload>
): WebhookPayload {
  return {
    tx_id: txId,
    tags,
    owner: 'test-owner-address',
    block_height: 1500000,
    block_timestamp: 1704067200,
    ...extra,
  };
}

// Base64-encoded 8-byte pHash (hex a5a5a5a5a5a5a5a5 → bytes → base64)
const PHASH_B64 = Buffer.from('a5a5a5a5a5a5a5a5', 'hex').toString('base64');

function manifestStoreTags(overrides?: Record<string, string>) {
  const defaults: Record<string, string> = {
    Protocol: 'C2PA-Manifest-Proof',
    'Protocol-Version': '1.0.0',
    'Content-Type': 'application/c2pa',
    'C2PA-Manifest-ID': 'urn:c2pa:test-manifest',
    'C2PA-Storage-Mode': 'manifest',
    'C2PA-Asset-Hash': 'dGVzdGhhc2g',
    'C2PA-Manifest-Store-Hash': 'c3RvcmVoYXNo',
    'C2PA-Manifest-Repo-URL': 'https://example.com/c2pa',
    'C2PA-Soft-Binding-Alg': 'org.ar-io.phash',
    'C2PA-Soft-Binding-Value': PHASH_B64,
  };
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged).map(([name, value]) => ({ name, value }));
}

function fullModeTags() {
  return manifestStoreTags({
    'C2PA-Storage-Mode': 'full',
    'Content-Type': 'image/jpeg',
    'C2PA-Asset-Content-Type': 'image/jpeg',
  });
}

function proofModeTags() {
  return manifestStoreTags({
    'C2PA-Storage-Mode': 'proof',
    'Content-Type': 'application/json',
    'C2PA-Manifest-ID': 'urn:c2pa:test-proof',
    'C2PA-Manifest-Fetch-URL': 'https://example.com/c2pa/manifests/test',
  });
}

describe('webhook - new schema', () => {
  it('indexes manifest-store from C2PA-Storage-Mode=manifest', async () => {
    const result = await processWebhook(buildPayload('tx-manifest', manifestStoreTags()));

    expect(result.action).toBe('indexed');
    expect(mockUpsertManifestArtifactWithBindings).toHaveBeenCalledTimes(1);

    const [artifact] = mockUpsertManifestArtifactWithBindings.mock.calls[0] as [
      { artifactKind: string; manifestId: string },
    ];
    expect(artifact.artifactKind).toBe('manifest-store');
    expect(artifact.manifestId).toBe('urn:c2pa:test-manifest');
  });

  it('indexes manifest-store from C2PA-Storage-Mode=full', async () => {
    const result = await processWebhook(buildPayload('tx-full', fullModeTags()));

    expect(result.action).toBe('indexed');
    const [artifact] = mockUpsertManifestArtifactWithBindings.mock.calls[0] as [
      { artifactKind: string },
    ];
    expect(artifact.artifactKind).toBe('manifest-store');
  });

  it('indexes proof-locator from C2PA-Storage-Mode=proof', async () => {
    const result = await processWebhook(buildPayload('tx-proof', proofModeTags()));

    expect(result.action).toBe('indexed');
    const [artifact] = mockUpsertManifestArtifactWithBindings.mock.calls[0] as [
      { artifactKind: string; manifestDigestAlg: string; manifestDigestB64: string },
    ];
    expect(artifact.artifactKind).toBe('proof-locator');
    expect(artifact.manifestDigestAlg).toBe('SHA-256');
    expect(artifact.manifestDigestB64).toBe('c3RvcmVoYXNo');
  });

  it('uses C2PA-Manifest-Fetch-URL for proof mode', async () => {
    const result = await processWebhook(buildPayload('tx-fetch', proofModeTags()));

    expect(result.action).toBe('indexed');
    const [artifact] = mockUpsertManifestArtifactWithBindings.mock.calls[0] as [
      { fetchUrl: string },
    ];
    expect(artifact.fetchUrl).toBe('https://example.com/c2pa/manifests/test');
  });

  it('derives pHash from C2PA-Soft-Binding-Value (base64)', async () => {
    const result = await processWebhook(buildPayload('tx-phash', manifestStoreTags()));

    expect(result.action).toBe('indexed');
    const [artifact] = mockUpsertManifestArtifactWithBindings.mock.calls[0] as [
      { phash: number[] },
    ];
    expect(artifact.phash).toHaveLength(64);
    // a5 = 10100101 → floats [1,0,1,0,0,1,0,1]
    expect(artifact.phash[0]).toBe(1.0);
    expect(artifact.phash[1]).toBe(0.0);
    expect(artifact.phash[2]).toBe(1.0);
  });

  it('reads C2PA-Asset-Content-Type for content type', async () => {
    const tags = manifestStoreTags({ 'C2PA-Asset-Content-Type': 'image/png' });
    const result = await processWebhook(buildPayload('tx-ct', tags));

    expect(result.action).toBe('indexed');
    const [artifact] = mockUpsertManifestArtifactWithBindings.mock.calls[0] as [
      { contentType: string },
    ];
    expect(artifact.contentType).toBe('image/png');
  });

  it('reads C2PA-Claim-Generator tag', async () => {
    const tags = manifestStoreTags({ 'C2PA-Claim-Generator': 'ArDrive C2PA/1.0' });
    const result = await processWebhook(buildPayload('tx-gen', tags));

    expect(result.action).toBe('indexed');
    const [artifact] = mockUpsertManifestArtifactWithBindings.mock.calls[0] as [
      { claimGenerator: string },
    ];
    expect(artifact.claimGenerator).toBe('ArDrive C2PA/1.0');
  });

  it('stores single soft binding record', async () => {
    const result = await processWebhook(buildPayload('tx-binding', manifestStoreTags()));

    expect(result.action).toBe('indexed');
    const [, bindings] = mockUpsertManifestArtifactWithBindings.mock.calls[0] as [
      unknown,
      Array<{ alg: string; valueB64: string }>,
    ];
    expect(bindings).toHaveLength(1);
    expect(bindings[0].alg).toBe('org.ar-io.phash');
    expect(bindings[0].valueB64).toBe(PHASH_B64);
  });
});

describe('webhook - rejection', () => {
  it('skips without Protocol=C2PA-Manifest-Proof', async () => {
    const tags = manifestStoreTags({ Protocol: 'SomeOther' });
    const result = await processWebhook(buildPayload('tx-no-proto', tags));

    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('Protocol');
  });

  it('rejects legacy Manifest-Type tags (no Protocol)', async () => {
    const legacyTags = [
      { name: 'Content-Type', value: 'application/c2pa' },
      { name: 'Manifest-Type', value: 'sidecar' },
      { name: 'C2PA-Manifest-Id', value: 'urn:uuid:test' },
      { name: 'C2PA-SoftBinding-Alg', value: 'org.ar-io.phash' },
      { name: 'C2PA-SoftBinding-Value', value: PHASH_B64 },
    ];
    const result = await processWebhook(buildPayload('tx-legacy', legacyTags));

    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('Protocol');
  });

  it('skips without C2PA-Manifest-ID', async () => {
    const tags = manifestStoreTags();
    const filtered = tags.filter((t) => t.name !== 'C2PA-Manifest-ID');
    const result = await processWebhook(buildPayload('tx-no-id', filtered));

    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('Missing required tags');
  });

  it('skips without C2PA-Storage-Mode', async () => {
    const tags = manifestStoreTags();
    const filtered = tags.filter((t) => t.name !== 'C2PA-Storage-Mode');
    const result = await processWebhook(buildPayload('tx-no-mode', filtered));

    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('Missing required tags');
  });

  it('skips without soft binding tags', async () => {
    const tags = manifestStoreTags();
    const filtered = tags.filter(
      (t) => t.name !== 'C2PA-Soft-Binding-Alg' && t.name !== 'C2PA-Soft-Binding-Value'
    );
    const result = await processWebhook(buildPayload('tx-no-bind', filtered));

    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('soft binding');
  });

  it('skips proof mode without C2PA-Manifest-Fetch-URL', async () => {
    const tags = proofModeTags().filter((t) => t.name !== 'C2PA-Manifest-Fetch-URL');
    const result = await processWebhook(buildPayload('tx-no-fetch', tags));

    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('proof-locator');
  });

  it('skips proof mode without C2PA-Manifest-Store-Hash', async () => {
    const tags = proofModeTags().filter((t) => t.name !== 'C2PA-Manifest-Store-Hash');
    const result = await processWebhook(buildPayload('tx-no-hash', tags));

    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('proof-locator');
  });

  it('skips already-indexed transactions', async () => {
    mockGetManifestByTxId.mockResolvedValueOnce({ id: 1 });
    const result = await processWebhook(buildPayload('tx-dup', manifestStoreTags()));

    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('Already indexed');
  });

  it('skips unsupported soft binding algorithm', async () => {
    const tags = manifestStoreTags({ 'C2PA-Soft-Binding-Alg': 'com.unknown.alg' });
    const result = await processWebhook(buildPayload('tx-bad-alg', tags));

    expect(result.action).toBe('skipped');
    expect(result.reason).toContain('Unsupported');
  });
});
