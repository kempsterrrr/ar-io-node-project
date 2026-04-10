/**
 * Mode 3: Proof-locator upload.
 *
 * Creates a lightweight proof-locator record that points to a remote
 * manifest URL (e.g. Adobe's repository, another SBR endpoint). The
 * original image is used to compute the asset hash and perceptual hash
 * for soft binding discovery.
 *
 * Flow:
 * 1. Validate required fields
 * 2. Detect content type from image
 * 3. Compute asset hash (SHA-256)
 * 4. Compute pHash (soft binding)
 * 5. Compute or accept manifest store hash
 * 6. Build JSON proof payload
 * 7. Build ANS-104 tags with storageMode='proof'
 * 8. Return proof payload + tags ready for Arweave upload
 */

import crypto from 'node:crypto';
import { ALG_PHASH, type Tag } from '@ar-io/c2pa-protocol';
import { detectContentType } from './detect.js';
import { computePHash } from './phash.js';
import { buildTags } from './tags.js';
import { extractProvenanceUrl } from './xmp.js';

export interface ProofAndPrepareOptions {
  /** Raw image buffer (for pHash computation and content type detection). */
  imageBuffer: Buffer;
  /** Remote URL where the C2PA manifest can be fetched. Auto-detected from XMP dcterms:provenance if omitted. */
  manifestFetchUrl?: string;
  /** C2PA manifest URN identifier. */
  manifestId: string;
  /** SBR API base URL (e.g. https://gateway.io/c2pa/v1). */
  manifestRepoUrl: string;
  /**
   * base64url SHA-256 of the remote manifest bytes.
   * If not provided and fetchAndVerifyManifest is true, the SDK will
   * fetch the manifest from manifestFetchUrl and compute the hash.
   */
  manifestStoreHash?: string;
  /**
   * When true and manifestStoreHash is not provided, fetch the manifest
   * from manifestFetchUrl to compute its SHA-256 hash. Default: true.
   */
  fetchAndVerifyManifest?: boolean;
  /** Override detected content type of the original image. */
  assetContentType?: string;
  /** Claim generator name/version (default: turbo-c2pa/0.1.0). */
  claimGenerator?: string;
}

export interface ProofAndPrepareResult {
  /** JSON proof-locator payload (for upload to Arweave). */
  proofPayload: Buffer;
  /** ANS-104 tags ready for Arweave upload. */
  tags: Tag[];
  /** C2PA manifest URN. */
  manifestId: string;
  /** base64url SHA-256 of original asset. */
  assetHash: string;
  /** base64url SHA-256 of the remote manifest. */
  manifestStoreHash: string;
  /** Content type of the upload payload (always application/json). */
  contentType: string;
  /** Detected MIME type of the original image. */
  assetContentType: string;
  /** Remote URL where the manifest can be fetched. */
  manifestFetchUrl: string;
  /** pHash hex string (16 chars). */
  pHashHex: string;
}

/**
 * Create a proof-locator record for Arweave upload (Mode 3: proof).
 *
 * Points to a remote manifest without re-signing or re-uploading it.
 * The sidecar will fetch-through to the remote URL with digest verification.
 */
export async function proofAndPrepare(
  options: ProofAndPrepareOptions
): Promise<ProofAndPrepareResult> {
  const {
    imageBuffer,
    manifestId,
    manifestRepoUrl,
    fetchAndVerifyManifest = true,
    claimGenerator = 'turbo-c2pa/0.1.0',
  } = options;

  // 1. Auto-detect manifestFetchUrl from XMP if not provided
  let manifestFetchUrl = options.manifestFetchUrl;
  if (!manifestFetchUrl) {
    manifestFetchUrl = extractProvenanceUrl(imageBuffer) ?? undefined;
  }
  if (!manifestFetchUrl) {
    throw new Error(
      'manifestFetchUrl is required for proof mode (provide it or use an image with dcterms:provenance in XMP)'
    );
  }
  if (!manifestId) {
    throw new Error('manifestId is required for proof mode');
  }

  // 2. Detect content type
  const assetContentType =
    options.assetContentType || detectContentType(new Uint8Array(imageBuffer));
  if (!assetContentType) {
    throw new Error('Unsupported image format — could not detect content type from magic bytes');
  }

  // 3. Compute SHA-256 of original asset
  const assetHash = crypto
    .createHash('sha256')
    .update(imageBuffer)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 4. Compute pHash
  const phash = await computePHash(imageBuffer);

  // 5. Compute or accept manifest store hash
  let manifestStoreHash = options.manifestStoreHash;
  if (!manifestStoreHash) {
    if (!fetchAndVerifyManifest) {
      throw new Error('manifestStoreHash is required when fetchAndVerifyManifest is false');
    }
    // Fetch the manifest and compute its hash
    const response = await fetch(manifestFetchUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch manifest from ${manifestFetchUrl}: ${response.status} ${response.statusText}`
      );
    }
    const manifestBytes = Buffer.from(await response.arrayBuffer());
    manifestStoreHash = crypto
      .createHash('sha256')
      .update(manifestBytes)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // 6. Build JSON proof payload
  const proofRecord = {
    type: 'c2pa-proof-locator',
    manifestFetchUrl,
    manifestStoreHash,
    manifestId,
    assetHash,
  };
  const proofPayload = Buffer.from(JSON.stringify(proofRecord));

  // 7. Build ANS-104 tags (proof mode)
  const contentType = 'application/json';
  const { tags } = buildTags({
    contentType,
    manifestId,
    storageMode: 'proof',
    assetHash,
    manifestStoreHash,
    manifestRepoUrl,
    assetContentType,
    manifestFetchUrl,
    softBindingAlg: ALG_PHASH,
    softBindingValue: phash.base64,
    claimGenerator,
  });

  return {
    proofPayload,
    tags,
    manifestId,
    assetHash,
    manifestStoreHash,
    contentType,
    assetContentType,
    manifestFetchUrl,
    pHashHex: phash.hex,
  };
}
