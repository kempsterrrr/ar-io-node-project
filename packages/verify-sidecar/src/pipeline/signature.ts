import { createHash, createVerify } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { base64UrlToBuffer } from '../utils/crypto.js';
import type { GatewayTransaction } from '../gateway/types.js';

/**
 * Pipeline Step 4: Verify the transaction signature.
 *
 * For L1 transactions (format 2), this verifies the RSA-PSS signature
 * over a deep hash of the transaction fields against the owner's public key.
 *
 * Returns true if valid, false if invalid, null if verification couldn't be performed.
 */
export async function verifySignature(tx: GatewayTransaction): Promise<boolean | null> {
  try {
    if (tx.format === 2) {
      return verifyL1Signature(tx);
    }
    // Format 1 transactions use a different signing scheme (legacy)
    // Not implemented — return null to indicate "not verified"
    logger.warn(
      { txId: tx.id, format: tx.format },
      'Unsupported transaction format for signature verification'
    );
    return null;
  } catch (error) {
    logger.error({ error, txId: tx.id }, 'Signature verification failed');
    return null;
  }
}

/**
 * Verify an Arweave L1 format-2 transaction signature.
 *
 * The signature covers a deep hash of:
 *   [format, owner, target, data_size, data_root, quantity, reward, last_tx, tags]
 *
 * The deep hash is SHA-384 applied recursively per the Arweave spec.
 * The signature is RSA-PSS with SHA-256, salt length 0.
 */
function verifyL1Signature(tx: GatewayTransaction): boolean {
  // Build the data to sign (deep hash of transaction fields)
  const signatureData = deepHashTransaction(tx);

  // Decode owner public key to DER format for Node.js crypto
  const ownerBuffer = base64UrlToBuffer(tx.owner);
  const publicKeyDer = rsaPublicKeyToDer(ownerBuffer);

  // Decode the signature
  const signatureBuffer = base64UrlToBuffer(tx.signature);

  // Verify using RSA-PSS with SHA-256, salt length 0
  const verifier = createVerify('sha256');
  verifier.update(signatureData);

  return verifier.verify(
    {
      key: publicKeyDer,
      padding: 1, // RSA_PKCS1_PSS_PADDING
      saltLength: 0,
    },
    signatureBuffer
  );
}

/**
 * Compute the deep hash of an Arweave format-2 transaction.
 *
 * Per the Arweave spec, the signed message is a deep hash of the
 * transaction fields in a specific order. Deep hash uses SHA-384
 * applied recursively to create a Merkle-like hash of nested data.
 */
function deepHashTransaction(tx: GatewayTransaction): Buffer {
  const fields: DeepHashChunk[] = [
    stringToBuffer(tx.format.toString()),
    base64UrlToBuffer(tx.owner),
    base64UrlToBuffer(tx.target || ''),
    stringToBuffer(tx.quantity || '0'),
    stringToBuffer(tx.reward || '0'),
    base64UrlToBuffer(tx.last_tx || ''),
    deepHashTags(tx.tags),
    stringToBuffer(tx.data_size || '0'),
    base64UrlToBuffer(tx.data_root || ''),
  ];

  return deepHash(fields);
}

type DeepHashChunk = Buffer | DeepHashChunk[];

/**
 * Compute deep hash following Arweave's recursive SHA-384 algorithm.
 *
 * For a single buffer: SHA-384("blob" + length + data)
 * For a list: SHA-384("list" + length + concat(deep_hash(each_item)))
 */
function deepHash(data: DeepHashChunk): Buffer {
  if (Buffer.isBuffer(data)) {
    // Leaf node: SHA-384 of "blob" tag + byte length + data
    const tag = stringToBuffer('blob');
    const length = stringToBuffer(data.byteLength.toString());
    return sha384(Buffer.concat([tag, length, data]));
  }

  // List node: SHA-384 of "list" tag + list length + concat of child hashes
  const tag = stringToBuffer('list');
  const length = stringToBuffer(data.length.toString());

  let acc = sha384(Buffer.concat([tag, length]));
  for (const item of data) {
    const itemHash = deepHash(item);
    acc = sha384(Buffer.concat([acc, itemHash]));
  }

  return acc;
}

/**
 * Deep hash the tags array.
 * Tags are a list of [name, value] pairs, each pair is a list of two buffers.
 */
function deepHashTags(tags: Array<{ name: string; value: string }>): DeepHashChunk {
  if (!tags || tags.length === 0) {
    return [];
  }
  return tags.map((tag) => [base64UrlToBuffer(tag.name), base64UrlToBuffer(tag.value)]);
}

function sha384(data: Buffer): Buffer {
  return createHash('sha384').update(data).digest();
}

function stringToBuffer(str: string): Buffer {
  return Buffer.from(str, 'utf-8');
}

/**
 * Convert a raw RSA modulus (n) to a DER-encoded public key.
 *
 * Arweave uses 4096-bit RSA keys. The owner field is the raw modulus (n)
 * encoded as base64url. The public exponent is always 65537 (0x010001).
 *
 * We construct a DER-encoded RSAPublicKey wrapped in a SubjectPublicKeyInfo
 * structure that Node.js crypto can use.
 */
function rsaPublicKeyToDer(modulusRaw: Buffer): Buffer {
  // Ensure modulus has leading zero if high bit is set (positive integer)
  const modulus =
    modulusRaw[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), modulusRaw]) : modulusRaw;

  // Public exponent: 65537 = 0x010001
  const exponent = Buffer.from([0x01, 0x00, 0x01]);

  // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
  const modulusInt = derInteger(modulus);
  const exponentInt = derInteger(exponent);
  const rsaPublicKey = derSequence(Buffer.concat([modulusInt, exponentInt]));

  // AlgorithmIdentifier for RSA: OID 1.2.840.113549.1.1.1 + NULL params
  const rsaOid = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
  const nullParam = Buffer.from([0x05, 0x00]);
  const algorithmId = derSequence(Buffer.concat([rsaOid, nullParam]));

  // SubjectPublicKeyInfo ::= SEQUENCE { algorithm, subjectPublicKey BIT STRING }
  const bitString = derBitString(rsaPublicKey);
  const spki = derSequence(Buffer.concat([algorithmId, bitString]));

  return spki;
}

function derLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  const bytes: number[] = [];
  let temp = length;
  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derSequence(content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x30]), derLength(content.length), content]);
}

function derInteger(value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x02]), derLength(value.length), value]);
}

function derBitString(content: Buffer): Buffer {
  // BIT STRING: tag + length + 0x00 (no unused bits) + content
  const inner = Buffer.concat([Buffer.from([0x00]), content]);
  return Buffer.concat([Buffer.from([0x03]), derLength(inner.length), inner]);
}
