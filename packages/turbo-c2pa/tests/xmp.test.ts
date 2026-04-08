import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { extractProvenanceUrl } from '../src/xmp.js';

const FIXTURE_DIR = path.resolve(import.meta.dirname, 'fixtures');
const cloudJpgPath = path.join(FIXTURE_DIR, 'cloud.jpg');
const hasCloudFixture = fs.existsSync(cloudJpgPath);
const describeWithFixture = hasCloudFixture ? describe : describe.skip;

describeWithFixture('extractProvenanceUrl (cloud.jpg fixture)', () => {
  it('extracts dcterms:provenance URL from Adobe-signed image', () => {
    const buf = fs.readFileSync(cloudJpgPath);
    const url = extractProvenanceUrl(buf);
    expect(url).toBe(
      'https://cai-manifests.adobe.com/manifests/adobe-urn-uuid-5f37e182-3687-462e-a7fb-573462780391'
    );
  });
});

describe('extractProvenanceUrl', () => {
  it('returns null for image without XMP provenance', async () => {
    const buf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    expect(extractProvenanceUrl(buf)).toBeNull();
  });

  it('returns null for empty buffer', () => {
    expect(extractProvenanceUrl(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for garbage data', () => {
    expect(extractProvenanceUrl(Buffer.from('not an image'))).toBeNull();
  });

  it('extracts URL from synthetic XMP-like buffer', () => {
    const xmp = Buffer.from(
      '<?xpacket?><rdf:RDF dcterms:provenance="https://example.com/manifest/test-123"></rdf:RDF>'
    );
    expect(extractProvenanceUrl(xmp)).toBe('https://example.com/manifest/test-123');
  });
});
