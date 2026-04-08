/**
 * Parse an ANS-104 data item binary header.
 *
 * Binary layout (signature type 1 / Arweave RSA-PSS):
 *   [signature_type: 2 bytes LE]
 *   [signature: 512 bytes]
 *   [owner: 512 bytes]
 *   [target_present: 1 byte (0 or 1)]
 *   [target: 0 or 32 bytes]
 *   [anchor_present: 1 byte (0 or 1)]
 *   [anchor: 0 or 32 bytes]
 *   [number_of_tags: 8 bytes LE]
 *   [number_of_tag_bytes: 8 bytes LE]
 *   [raw_tag_bytes: Avro-serialized tags]
 */

// Signature type → { sigLength, ownerLength }
const SIG_CONFIG: Record<number, { sigLength: number; ownerLength: number }> = {
  1: { sigLength: 512, ownerLength: 512 }, // Arweave RSA-PSS 4096
  2: { sigLength: 64, ownerLength: 32 }, // ED25519
  3: { sigLength: 64, ownerLength: 65 }, // Ethereum ECDSA
  4: { sigLength: 64, ownerLength: 49 }, // Solana ED25519
};

export interface ParsedDataItemHeader {
  signatureType: number;
  signature: Uint8Array;
  owner: Uint8Array;
  target: Uint8Array;
  anchor: Uint8Array;
  rawTagBytes: Uint8Array;
  tagCount: number;
}

export function parseDataItemHeader(buf: Buffer): ParsedDataItemHeader | null {
  try {
    let offset = 0;

    // Signature type (2 bytes LE)
    const signatureType = buf.readUInt16LE(offset);
    offset += 2;

    const config = SIG_CONFIG[signatureType];
    if (!config) return null;

    // Signature
    const signature = buf.slice(offset, offset + config.sigLength);
    offset += config.sigLength;

    // Owner
    const owner = buf.slice(offset, offset + config.ownerLength);
    offset += config.ownerLength;

    // Target (optional)
    const targetPresent = buf[offset];
    offset += 1;
    let target: Uint8Array;
    if (targetPresent === 1) {
      target = buf.slice(offset, offset + 32);
      offset += 32;
    } else {
      target = new Uint8Array(0);
    }

    // Anchor (optional)
    const anchorPresent = buf[offset];
    offset += 1;
    let anchor: Uint8Array;
    if (anchorPresent === 1) {
      anchor = buf.slice(offset, offset + 32);
      offset += 32;
    } else {
      anchor = new Uint8Array(0);
    }

    // Number of tags (8 bytes LE)
    const tagCount = Number(buf.readBigUInt64LE(offset));
    offset += 8;

    // Number of tag bytes (8 bytes LE)
    const tagBytesLength = Number(buf.readBigUInt64LE(offset));
    offset += 8;

    // Raw tag bytes (exact Avro-serialized binary)
    const rawTagBytes = buf.slice(offset, offset + tagBytesLength);

    return {
      signatureType,
      signature: new Uint8Array(signature),
      owner: new Uint8Array(owner),
      target: new Uint8Array(target),
      anchor: new Uint8Array(anchor),
      rawTagBytes: new Uint8Array(rawTagBytes),
      tagCount,
    };
  } catch {
    return null;
  }
}
