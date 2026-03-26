/**
 * Mode 1: Full media + embedded manifest.
 *
 * Orchestrates the complete flow:
 * 1. Detect content type
 * 2. Compute asset hash (SHA-256)
 * 3. Compute pHash (soft binding)
 * 4. Sign with c2pa-node via remote signer
 * 5. Build ANS-104 tags
 * 6. Return signed buffer + tags ready for Arweave upload
 */

import crypto from 'node:crypto';
import { ALG_PHASH, type Tag } from '@ar-io/c2pa-protocol';
import { RemoteSigner } from './signer.js';
import { detectContentType } from './detect.js';
import { computePHash } from './phash.js';
import { signManifest } from './manifest.js';
import { buildTags } from './tags.js';

export interface SignAndPrepareOptions {
  /** Raw image buffer. */
  imageBuffer: Buffer;
  /** The remote signer (calls sidecar /v1/sign). */
  remoteSigner: RemoteSigner;
  /** SBR API base URL (e.g. https://gateway.io/c2pa/v1). */
  manifestRepoUrl: string;
  /** Claim generator name/version (default: turbo-c2pa/0.1.0). */
  claimGenerator?: string;
  /** PEM-encoded trust anchor CA cert (for dev certs). */
  trustAnchorPem?: string;
  /** Ethereum private key — used for upload. Only included in identity assertion if includeIdentity is true. */
  ethPrivateKey?: string;
  /** Include cawg.identity assertion linking wallet address. EXPERIMENTAL: c2pa-rs validation not yet implemented. Default: false. */
  includeIdentity?: boolean;
  /**
   * IPTC digital source type for the c2pa.created action.
   * Required by C2PA spec. Common values:
   * - 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture'
   * - 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
   * - 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic'
   */
  digitalSourceType?: string;
}

export interface SignAndPrepareResult {
  /** Image with embedded C2PA manifest. */
  signedBuffer: Buffer;
  /** ANS-104 tags ready for Arweave upload. */
  tags: Tag[];
  /** C2PA manifest URN. */
  manifestId: string;
  /** base64url SHA-256 of original asset. */
  assetHash: string;
  /** base64url SHA-256 of manifest store. */
  manifestStoreHash: string;
  /** Detected content type. */
  contentType: string;
  /** pHash hex string (16 chars). */
  pHashHex: string;
}

/**
 * Sign an image and prepare it for Arweave upload (Mode 1: full embed).
 */
export async function signAndPrepare(
  options: SignAndPrepareOptions
): Promise<SignAndPrepareResult> {
  const {
    imageBuffer,
    remoteSigner,
    manifestRepoUrl,
    claimGenerator = 'turbo-c2pa/0.1.0',
    trustAnchorPem,
    ethPrivateKey,
    includeIdentity = false,
    digitalSourceType,
  } = options;

  // 1. Detect content type
  const contentType = detectContentType(new Uint8Array(imageBuffer));
  if (!contentType) {
    throw new Error('Unsupported image format — could not detect content type from magic bytes');
  }

  // 2. Compute SHA-256 of original asset
  const assetHashRaw = crypto.createHash('sha256').update(imageBuffer).digest();
  const assetHash = assetHashRaw
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 3. Compute pHash
  const phash = await computePHash(imageBuffer);

  // 4. Sign with c2pa-node
  const signResult = await signManifest({
    imageBuffer,
    mimeType: contentType,
    remoteSigner,
    claimGenerator,
    trustAnchorPem,
    ethPrivateKey: includeIdentity ? ethPrivateKey : undefined,
    digitalSourceType,
  });

  // 5. Generate manifest ID
  const manifestId = `urn:c2pa:${crypto.randomUUID()}`;

  // 6. Build ANS-104 tags
  const { tags } = buildTags({
    contentType,
    manifestId,
    storageMode: 'full',
    assetHash,
    manifestStoreHash: signResult.manifestStoreHash,
    manifestRepoUrl,
    softBindingAlg: ALG_PHASH,
    softBindingValue: phash.base64,
    claimGenerator,
  });

  return {
    signedBuffer: signResult.signedBuffer,
    tags,
    manifestId,
    assetHash,
    manifestStoreHash: signResult.manifestStoreHash,
    contentType,
    pHashHex: phash.hex,
  };
}
