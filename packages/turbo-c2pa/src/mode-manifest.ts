/**
 * Mode 2: Manifest-only upload.
 *
 * Signs an image with a C2PA manifest but uploads only the raw manifest
 * bytes to Arweave (not the image). The original image is used to compute
 * the asset hash and perceptual hash for soft binding.
 *
 * Flow:
 * 1. Detect content type
 * 2. Compute asset hash (SHA-256)
 * 3. Compute pHash (soft binding)
 * 4. Sign with c2pa-node via remote signer
 * 5. Build ANS-104 tags with storageMode='manifest'
 * 6. Return manifest bytes + tags ready for Arweave upload
 */

import crypto from 'node:crypto';
import { ALG_PHASH, type Tag } from '@ar-io/c2pa-protocol';
import { RemoteSigner } from './signer.js';
import { detectContentType } from './detect.js';
import { computePHash } from './phash.js';
import { signManifest } from './manifest.js';
import { buildTags } from './tags.js';

export interface SignManifestAndPrepareOptions {
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

export interface SignManifestAndPrepareResult {
  /** Raw JUMBF manifest store bytes (for upload to Arweave). */
  manifestBytes: Buffer;
  /** ANS-104 tags ready for Arweave upload. */
  tags: Tag[];
  /** C2PA manifest URN. */
  manifestId: string;
  /** base64url SHA-256 of original asset. */
  assetHash: string;
  /** base64url SHA-256 of manifest store. */
  manifestStoreHash: string;
  /** Content type of the upload payload (always application/c2pa). */
  contentType: string;
  /** Detected MIME type of the original image. */
  assetContentType: string;
  /** pHash hex string (16 chars). */
  pHashHex: string;
}

/**
 * Sign an image and prepare its manifest for standalone Arweave upload (Mode 2: manifest-only).
 *
 * The image is signed to produce a C2PA manifest, but only the manifest bytes
 * are returned for upload. The image itself is not uploaded.
 */
export async function signManifestAndPrepare(
  options: SignManifestAndPrepareOptions
): Promise<SignManifestAndPrepareResult> {
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
  const assetContentType = detectContentType(new Uint8Array(imageBuffer));
  if (!assetContentType) {
    throw new Error('Unsupported image format — could not detect content type from magic bytes');
  }

  // 2. Compute SHA-256 of original asset
  const assetHash = crypto
    .createHash('sha256')
    .update(imageBuffer)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 3. Compute pHash
  const phash = await computePHash(imageBuffer);

  // 4. Sign with c2pa-node
  const signResult = await signManifest({
    imageBuffer,
    mimeType: assetContentType,
    remoteSigner,
    claimGenerator,
    trustAnchorPem,
    ethPrivateKey: includeIdentity ? ethPrivateKey : undefined,
    digitalSourceType,
  });

  // 5. Generate manifest ID
  const manifestId = `urn:c2pa:${crypto.randomUUID()}`;

  // 6. Build ANS-104 tags (manifest mode)
  const contentType = 'application/c2pa';
  const { tags } = buildTags({
    contentType,
    manifestId,
    storageMode: 'manifest',
    assetHash,
    manifestStoreHash: signResult.manifestStoreHash,
    manifestRepoUrl,
    assetContentType,
    softBindingAlg: ALG_PHASH,
    softBindingValue: phash.base64,
    claimGenerator,
  });

  return {
    manifestBytes: signResult.manifestBytes,
    tags,
    manifestId,
    assetHash,
    manifestStoreHash: signResult.manifestStoreHash,
    contentType,
    assetContentType,
    pHashHex: phash.hex,
  };
}
