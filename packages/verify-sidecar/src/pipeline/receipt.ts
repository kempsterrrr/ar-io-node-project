import { createVerify } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { base64UrlToBuffer, bufferToBase64Url, ownerToAddress } from '../utils/crypto.js';
import { fetchWithTimeout } from '../utils/http.js';
import type { VerificationResult } from '../types.js';

const TURBO_STATUS_URL = 'https://upload.ardrive.io';

interface TurboReceipt {
  id: string;
  version: string;
  public: string;
  signature: string;
  timestamp: number;
  owner?: string;
  winc?: string;
  deadlineHeight?: number;
  dataCaches?: string[];
  fastFinalityIndexes?: string[];
}

interface ReceiptVerificationInput {
  receipt: Record<string, unknown>;
  txId: string;
  onChainOwnerAddress: string | null;
  blockTimestamp: string | null;
}

/**
 * Pipeline Step 6: Verify a Turbo upload receipt.
 *
 * Validates structure, verifies the cryptographic signature, cross-references
 * against on-chain data, and checks the Turbo status endpoint.
 */
export async function verifyReceipt(
  input: ReceiptVerificationInput
): Promise<VerificationResult['receipt']> {
  const { receipt: raw, txId, onChainOwnerAddress, blockTimestamp } = input;

  try {
    // Structural validation
    const receipt = validateStructure(raw);
    if (!receipt) {
      logger.warn({ txId }, 'Invalid receipt structure');
      return buildResult({ provided: true });
    }

    // Signature verification
    const signatureValid = verifyReceiptSignature(receipt);

    // Cross-reference checks
    const receiptOwnerAddress = receipt.owner ?? deriveOwnerFromPublicKey(receipt.public);
    const receiptIdMatchesTxId = receipt.id === txId;
    const ownerMatchesOnChain =
      onChainOwnerAddress !== null ? receiptOwnerAddress === onChainOwnerAddress : null;

    // Timestamp comparison
    const receiptTimestamp = new Date(receipt.timestamp).toISOString();
    let timestampPredatesBlock: boolean | null = null;
    if (blockTimestamp) {
      timestampPredatesBlock = receipt.timestamp < new Date(blockTimestamp).getTime();
    }

    // Turbo status check
    const turboStatus = await checkTurboStatus(receipt.id);

    return {
      provided: true,
      signatureValid,
      receiptTimestamp,
      receiptOwner: receiptOwnerAddress,
      ownerMatchesOnChain,
      receiptIdMatchesTxId,
      timestampPredatesBlock,
      turboStatus,
    };
  } catch (error) {
    logger.error({ error, txId }, 'Receipt verification failed');
    return buildResult({ provided: true });
  }
}

/**
 * Validate that the receipt has all required fields.
 */
function validateStructure(raw: Record<string, unknown>): TurboReceipt | null {
  if (
    typeof raw.id !== 'string' ||
    typeof raw.version !== 'string' ||
    typeof raw.public !== 'string' ||
    typeof raw.signature !== 'string' ||
    typeof raw.timestamp !== 'number'
  ) {
    return null;
  }
  return raw as unknown as TurboReceipt;
}

/**
 * Verify the receipt's cryptographic signature.
 *
 * Turbo receipts are signed with the service's RSA key. The signed payload
 * is constructed from receipt fields in a specific order.
 */
function verifyReceiptSignature(receipt: TurboReceipt): boolean | null {
  try {
    const publicKeyBuffer = base64UrlToBuffer(receipt.public);
    const signatureBuffer = base64UrlToBuffer(receipt.signature);

    // Reconstruct the signed data. Turbo receipts sign a concatenation of
    // key fields. The exact format depends on the version.
    const dataToVerify = buildSignedPayload(receipt);
    if (!dataToVerify) return null;

    // Convert raw RSA public key to DER for Node.js crypto
    const publicKeyDer = rsaPublicKeyToDer(publicKeyBuffer);

    const verifier = createVerify('sha256');
    verifier.update(dataToVerify);
    return verifier.verify({ key: publicKeyDer, padding: 1, saltLength: 0 }, signatureBuffer);
  } catch (error) {
    logger.warn({ error }, 'Receipt signature verification error');
    return null;
  }
}

/**
 * Build the payload that was signed by Turbo.
 * The payload format varies by receipt version.
 */
function buildSignedPayload(receipt: TurboReceipt): Buffer | null {
  try {
    // Common approach: sign the receipt ID + timestamp + other fields
    // The exact format depends on the Turbo receipt version
    const parts = [
      receipt.id,
      receipt.timestamp.toString(),
      receipt.winc ?? '',
      receipt.deadlineHeight?.toString() ?? '',
    ];
    return Buffer.from(parts.join(''));
  } catch {
    return null;
  }
}

/**
 * Derive an Arweave wallet address from the receipt's public key.
 */
function deriveOwnerFromPublicKey(publicKeyB64Url: string): string {
  try {
    return ownerToAddress(publicKeyB64Url);
  } catch {
    return 'unknown';
  }
}

/**
 * Check the Turbo status endpoint for this transaction.
 */
async function checkTurboStatus(txId: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${TURBO_STATUS_URL}/v1/tx/${txId}/status`, 10000);
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string };
    return data.status ?? null;
  } catch {
    return null;
  }
}

function buildResult(
  partial: Partial<VerificationResult['receipt']>
): VerificationResult['receipt'] {
  return {
    provided: partial.provided ?? false,
    signatureValid: partial.signatureValid ?? null,
    receiptTimestamp: partial.receiptTimestamp ?? null,
    receiptOwner: partial.receiptOwner ?? null,
    ownerMatchesOnChain: partial.ownerMatchesOnChain ?? null,
    receiptIdMatchesTxId: partial.receiptIdMatchesTxId ?? null,
    timestampPredatesBlock: partial.timestampPredatesBlock ?? null,
    turboStatus: partial.turboStatus ?? null,
  };
}

/**
 * Convert raw RSA modulus to DER-encoded SubjectPublicKeyInfo.
 * Same as in signature.ts — duplicated to avoid circular deps.
 */
function rsaPublicKeyToDer(modulusRaw: Buffer): Buffer {
  const modulus =
    modulusRaw[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), modulusRaw]) : modulusRaw;
  const exponent = Buffer.from([0x01, 0x00, 0x01]);

  const modulusInt = derWrap(0x02, modulus);
  const exponentInt = derWrap(0x02, exponent);
  const rsaPublicKey = derWrap(0x30, Buffer.concat([modulusInt, exponentInt]));

  const rsaOid = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
  const nullParam = Buffer.from([0x05, 0x00]);
  const algorithmId = derWrap(0x30, Buffer.concat([rsaOid, nullParam]));

  const bitStringInner = Buffer.concat([Buffer.from([0x00]), rsaPublicKey]);
  const bitString = derWrap(0x03, bitStringInner);

  return derWrap(0x30, Buffer.concat([algorithmId, bitString]));
}

function derWrap(tag: number, content: Buffer): Buffer {
  const len = content.length;
  if (len < 0x80) {
    return Buffer.concat([Buffer.from([tag, len]), content]);
  }
  const bytes: number[] = [];
  let temp = len;
  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }
  return Buffer.concat([Buffer.from([tag, 0x80 | bytes.length, ...bytes]), content]);
}
