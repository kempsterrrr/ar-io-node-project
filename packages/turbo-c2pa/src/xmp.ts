/**
 * XMP metadata extraction for C2PA remote manifest discovery.
 *
 * The C2PA specification uses dcterms:provenance in XMP metadata to point
 * to remote manifest stores. This is the standard mechanism used by the
 * c2pa-rs reference implementation (Adobe's SDK) for remote manifest
 * discovery — see sdk/src/utils/xmp_inmemory_utils.rs in c2pa-rs.
 *
 * XMP is embedded as plaintext XML in JPEG APP1 markers, PNG iTXt chunks,
 * etc. We extract it via a simple regex scan on the raw bytes.
 */

/**
 * Extract dcterms:provenance URL from image XMP metadata.
 *
 * Returns the remote manifest store URL if found, null otherwise.
 * This is the C2PA-standard mechanism for discovering remote manifests.
 */
export function extractProvenanceUrl(imageBuffer: Buffer): string | null {
  // XMP is plaintext XML typically in the first ~1MB of the file
  const searchLimit = Math.min(imageBuffer.length, 1_000_000);
  const searchRegion = imageBuffer.toString('utf-8', 0, searchLimit);
  const match = searchRegion.match(/dcterms:provenance="([^"]+)"/);
  return match ? match[1] : null;
}
