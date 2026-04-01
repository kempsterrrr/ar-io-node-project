/**
 * Content-type detection from file magic bytes.
 * Extracted from @ar-io/turbo-c2pa.
 */

const SIGNATURES: Array<{
  mime: string;
  check: (buf: Uint8Array) => boolean;
}> = [
  {
    mime: 'image/jpeg',
    check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/gif',
    check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  },
  {
    mime: 'image/webp',
    check: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mime: 'image/tiff',
    check: (b) =>
      (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a),
  },
  {
    mime: 'image/avif',
    check: (b) =>
      b[4] === 0x66 &&
      b[5] === 0x74 &&
      b[6] === 0x79 &&
      b[7] === 0x70 &&
      b[8] === 0x61 &&
      b[9] === 0x76 &&
      b[10] === 0x69 &&
      b[11] === 0x66,
  },
  {
    mime: 'image/heif',
    check: (b) =>
      b[4] === 0x66 &&
      b[5] === 0x74 &&
      b[6] === 0x79 &&
      b[7] === 0x70 &&
      b[8] === 0x68 &&
      b[9] === 0x65 &&
      b[10] === 0x69 &&
      b[11] === 0x63,
  },
  {
    mime: 'application/pdf',
    check: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
];

/**
 * Detect MIME type from file magic bytes.
 * Returns null if the format is not recognized.
 * Requires at least 12 bytes.
 */
export function detectContentType(buffer: Uint8Array): string | null {
  if (buffer.length < 12) {
    return null;
  }
  for (const sig of SIGNATURES) {
    if (sig.check(buffer)) {
      return sig.mime;
    }
  }
  return null;
}

/** List of MIME types supported for content-type detection. */
export const SUPPORTED_CONTENT_TYPES = SIGNATURES.map((s) => s.mime);
