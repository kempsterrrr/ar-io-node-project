import { createHash, verify as rsaVerify, constants as cryptoConstants } from 'node:crypto';

/**
 * Derive an Arweave wallet address from an owner public key.
 * Address = base64url(SHA-256(base64url_decode(owner)))
 */
export function ownerToAddress(ownerB64Url: string): string {
  const ownerBytes = base64UrlToBuffer(ownerB64Url);
  const hash = createHash('sha256').update(ownerBytes).digest();
  return bufferToBase64Url(hash);
}

/**
 * Compute SHA-256 hash of a buffer, returned as base64url.
 */
export function sha256B64Url(data: Buffer | Uint8Array): string {
  const hash = createHash('sha256').update(data).digest();
  return bufferToBase64Url(hash);
}

export function base64UrlToBuffer(b64url: string): Buffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

export function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Deep Hash — recursive SHA-384 hashing per Arweave spec
// Used to reconstruct the signed payload for data items and transactions.
// ---------------------------------------------------------------------------

type DeepHashChunk = Uint8Array | DeepHashChunk[];

function sha384(data: Uint8Array): Uint8Array {
  return createHash('sha384').update(data).digest();
}

function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    result.set(b, offset);
    offset += b.byteLength;
  }
  return result;
}

/**
 * Arweave deep hash algorithm.
 * For a blob (Uint8Array): hash("blob" + length) paired with hash(data).
 * For a list (array): hash("list" + count), then fold each element hash.
 */
export function deepHash(data: DeepHashChunk): Uint8Array {
  if (data instanceof Uint8Array) {
    const tag = concatBuffers([
      new TextEncoder().encode('blob'),
      new TextEncoder().encode(data.byteLength.toString()),
    ]);
    const tagHash = sha384(tag);
    const dataHash = sha384(data);
    return sha384(concatBuffers([tagHash, dataHash]));
  }

  // Array: fold left over element hashes
  const tag = concatBuffers([
    new TextEncoder().encode('list'),
    new TextEncoder().encode(data.length.toString()),
  ]);
  let acc = sha384(tag);

  for (const chunk of data) {
    const chunkHash = deepHash(chunk);
    acc = sha384(concatBuffers([acc, chunkHash]));
  }

  return acc;
}

// ---------------------------------------------------------------------------
// ANS-104 Avro tag serialization
// Tags must be re-encoded to their original binary form for deep hash.
// Uses Apache Avro encoding: zigzag-encoded longs + raw bytes.
// ---------------------------------------------------------------------------

function avroLong(n: number): Uint8Array {
  // Zigzag encode: (n << 1) ^ (n >> 63), then varint encode
  let zigzag = n >= 0 ? n * 2 : -n * 2 - 1;
  const bytes: number[] = [];
  while (zigzag > 127) {
    bytes.push((zigzag & 0x7f) | 0x80);
    zigzag >>>= 7;
  }
  bytes.push(zigzag & 0x7f);
  return new Uint8Array(bytes);
}

function avroBytes(data: Uint8Array): Uint8Array {
  return concatBuffers([avroLong(data.byteLength), data]);
}

/**
 * Serialize tags into ANS-104 Avro binary format.
 * Avro array: count of items (zigzag long), then items, then 0 terminator.
 * Each item is a record with two "bytes" fields: name and value.
 */
export function serializeAvroTags(tags: Array<{ name: string; value: string }>): Uint8Array {
  if (tags.length === 0) {
    // Empty array: just the zero terminator
    return avroLong(0);
  }

  const parts: Uint8Array[] = [];

  // Block count (positive = number of items in this block)
  parts.push(avroLong(tags.length));

  for (const tag of tags) {
    // Each tag record: name bytes, then value bytes
    // Tags from the gateway are base64url-encoded originals
    const nameBytes = base64UrlToBuffer(tag.name);
    const valueBytes = base64UrlToBuffer(tag.value);
    parts.push(avroBytes(nameBytes));
    parts.push(avroBytes(valueBytes));
  }

  // End of array marker
  parts.push(avroLong(0));

  return concatBuffers(parts);
}

// ---------------------------------------------------------------------------
// RSA-PSS Signature Verification
// Arweave uses RSA-PSS with SHA-256, 4096-bit keys, salt length 32.
// ---------------------------------------------------------------------------

/**
 * Convert an Arweave base64url public key (the raw RSA modulus "n") to a
 * PEM-encoded PKCS#1 RSAPublicKey.
 *
 * Arweave public keys use exponent e = 65537 (0x010001).
 */
function ownerToPem(ownerB64Url: string): string {
  const modulus = base64UrlToBuffer(ownerB64Url);
  const exponent = Buffer.from([0x01, 0x00, 0x01]); // 65537

  // DER-encode RSAPublicKey ::= SEQUENCE { modulus INTEGER, exponent INTEGER }
  const modulusDer = derInteger(modulus);
  const exponentDer = derInteger(exponent);
  const rsaKeyBody = Buffer.concat([modulusDer, exponentDer]);
  const rsaKeySeq = derSequence(rsaKeyBody);

  const pem =
    '-----BEGIN RSA PUBLIC KEY-----\n' +
    rsaKeySeq
      .toString('base64')
      .match(/.{1,64}/g)!
      .join('\n') +
    '\n-----END RSA PUBLIC KEY-----';

  return pem;
}

function derLength(length: number): Buffer {
  if (length < 128) return Buffer.from([length]);
  if (length < 256) return Buffer.from([0x81, length]);
  if (length < 65536) return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  // For very large values
  return Buffer.from([0x83, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
}

function derInteger(data: Buffer): Buffer {
  // Prepend 0x00 if high bit is set (to keep it positive)
  const padded = data[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), data]) : data;
  return Buffer.concat([Buffer.from([0x02]), derLength(padded.length), padded]);
}

function derSequence(data: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x30]), derLength(data.length), data]);
}

export interface SignatureVerifyInput {
  /** Base64url-encoded RSA-PSS signature */
  signatureB64Url: string;
  /** Base64url-encoded RSA public key (modulus "n") */
  ownerB64Url: string;
  /** The message that was signed (deep hash output) */
  message: Uint8Array;
}

/**
 * Verify an Arweave RSA-PSS signature.
 * Algorithm: RSA-PSS, hash SHA-256.
 * Uses saltLength: auto to accept both salt=0 (arweave-js default) and salt=32.
 */
export function verifyRsaPssSignature(input: SignatureVerifyInput): boolean {
  const { signatureB64Url, ownerB64Url, message } = input;

  const pem = ownerToPem(ownerB64Url);
  const signature = base64UrlToBuffer(signatureB64Url);

  return rsaVerify(
    'sha256',
    message,
    {
      key: pem,
      padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      saltLength: cryptoConstants.RSA_PSS_SALTLEN_AUTO,
    },
    signature
  );
}

// ---------------------------------------------------------------------------
// Data Item Signature Verification (full pipeline)
// ---------------------------------------------------------------------------

export interface TransactionFields {
  /** Transaction format (1 or 2) */
  format: number;
  /** Base64url-encoded signature */
  signatureB64Url: string;
  /** Base64url-encoded owner public key (RSA modulus) */
  ownerB64Url: string;
  /** Target address (base64url, empty if no transfer) */
  targetB64Url: string;
  /** Anchor / last_tx (base64url) */
  anchorB64Url: string;
  /** Tags in their original base64url-encoded form from /tx endpoint */
  rawTags: Array<{ name: string; value: string }>;
  /** Quantity in winston (string) */
  quantity: string;
  /** Mining reward in winston (string) */
  reward: string;
  /** Data root (base64url, format 2 only) */
  dataRoot: string;
  /** Data size in bytes (string) */
  dataSize: string;
  /** Raw data bytes (downloaded from GET /raw/{txId}) — used for format 1 only */
  data: Uint8Array | null;
}

/**
 * Verify the signature of an Arweave transaction (L1).
 *
 * Format 2 (current): deepHash(["2", owner, target, quantity, reward, last_tx, tags, data_size, data_root])
 * Format 1 (legacy):  deepHash([owner, target, quantity, reward, last_tx, tags, data])
 *
 * Tags are passed as a nested array: [[name1, value1], [name2, value2], ...]
 * where each name/value is a Uint8Array (decoded from base64url).
 */
export function verifyTransactionSignature(tx: TransactionFields): boolean {
  const ownerBytes = base64UrlToBuffer(tx.ownerB64Url);
  const targetBytes = tx.targetB64Url ? base64UrlToBuffer(tx.targetB64Url) : new Uint8Array(0);
  const anchorBytes = tx.anchorB64Url ? base64UrlToBuffer(tx.anchorB64Url) : new Uint8Array(0);

  // Tags for L1 transactions use a nested array format in deep hash,
  // NOT Avro serialization (that's for ANS-104 data items only)
  const tagChunks: DeepHashChunk = tx.rawTags.map((tag) => [
    base64UrlToBuffer(tag.name),
    base64UrlToBuffer(tag.value),
  ]);

  let message: Uint8Array;

  if (tx.format === 2) {
    const dataRootBytes = tx.dataRoot ? base64UrlToBuffer(tx.dataRoot) : new Uint8Array(0);

    message = deepHash([
      new TextEncoder().encode('2'),
      ownerBytes,
      targetBytes,
      new TextEncoder().encode(tx.quantity),
      new TextEncoder().encode(tx.reward),
      anchorBytes,
      tagChunks,
      new TextEncoder().encode(tx.dataSize),
      dataRootBytes,
    ]);
  } else {
    // Format 1: includes raw data instead of data_size + data_root
    const dataBytes = tx.data ?? new Uint8Array(0);
    message = deepHash([
      ownerBytes,
      targetBytes,
      new TextEncoder().encode(tx.quantity),
      new TextEncoder().encode(tx.reward),
      anchorBytes,
      tagChunks,
      dataBytes,
    ]);
  }

  return verifyRsaPssSignature({
    signatureB64Url: tx.signatureB64Url,
    ownerB64Url: tx.ownerB64Url,
    message,
  });
}

/**
 * Verify the signature of an ANS-104 data item.
 * Reconstructs the deep hash from the data item fields and verifies RSA-PSS.
 */
export interface DataItemFields {
  signatureType: number;
  signatureB64Url: string;
  ownerB64Url: string;
  targetB64Url: string;
  anchorB64Url: string;
  rawTags: Array<{ name: string; value: string }>;
  data: Uint8Array;
}

export function verifyDataItemSignature(item: DataItemFields): boolean {
  const ownerBytes = base64UrlToBuffer(item.ownerB64Url);
  const targetBytes = item.targetB64Url ? base64UrlToBuffer(item.targetB64Url) : new Uint8Array(0);
  const anchorBytes = item.anchorB64Url ? base64UrlToBuffer(item.anchorB64Url) : new Uint8Array(0);

  const tagBytes = serializeAvroTags(item.rawTags);

  const message = deepHash([
    new TextEncoder().encode('dataitem'),
    new TextEncoder().encode('1'),
    new TextEncoder().encode(item.signatureType.toString()),
    ownerBytes,
    targetBytes,
    anchorBytes,
    tagBytes,
    item.data instanceof Buffer ? item.data : new Uint8Array(item.data),
  ]);

  return verifyRsaPssSignature({
    signatureB64Url: item.signatureB64Url,
    ownerB64Url: item.ownerB64Url,
    message,
  });
}

/**
 * Verify a data item using the exact binary header parsed from the bundle.
 * This is 100% accurate — uses the original bytes with no encoding roundtrips.
 */
export function verifyDataItemSignatureRaw(input: {
  signatureType: number;
  signature: Uint8Array;
  owner: Uint8Array;
  target: Uint8Array;
  anchor: Uint8Array;
  rawTagBytes: Uint8Array;
  data: Uint8Array;
}): boolean {
  const message = deepHash([
    new TextEncoder().encode('dataitem'),
    new TextEncoder().encode('1'),
    new TextEncoder().encode(input.signatureType.toString()),
    input.owner,
    input.target,
    input.anchor,
    input.rawTagBytes,
    input.data,
  ]);

  const sigB64 = bufferToBase64Url(Buffer.from(input.signature));
  const ownerB64 = bufferToBase64Url(Buffer.from(input.owner));

  return verifyRsaPssSignature({
    signatureB64Url: sigB64,
    ownerB64Url: ownerB64,
    message,
  });
}
