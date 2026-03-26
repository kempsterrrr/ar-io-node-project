/**
 * Mode: Store — preserve existing C2PA manifests on Arweave.
 *
 * Accepts an image with an existing C2PA manifest, extracts and validates
 * the manifest using c2pa-node Reader, computes soft binding and hashes,
 * builds ANS-104 tags, and returns the original bytes unchanged.
 *
 * This is the "repository path" — customers bring pre-signed content and
 * we store it durably on Arweave for discovery via SBR.
 */

import crypto from 'node:crypto';
import {
  Reader,
  createVerifySettings,
  createTrustSettings,
  mergeSettings,
  settingsToJson,
} from '@contentauth/c2pa-node';
import { ALG_PHASH, type Tag } from '@ar-io/c2pa-protocol';
import { detectContentType } from './detect.js';
import { computePHash } from './phash.js';
import { buildTags } from './tags.js';

export interface StoreAndPrepareOptions {
  /** Image buffer with existing C2PA manifest embedded. */
  imageBuffer: Buffer;
  /** SBR API base URL (e.g. https://gateway.io/c2pa/v1). */
  manifestRepoUrl: string;
  /** Claim generator name for tags (default: turbo-c2pa-store/0.1.0). */
  claimGenerator?: string;
  /**
   * If true, reject images that fail signature validation.
   * Default: false — as a repository, we store manifests and report validation
   * status, but don't reject for untrusted signing credentials (which is expected
   * for third-party content). Set to true to enforce strict validation.
   */
  requireValidSignature?: boolean;
  /** PEM-encoded trust anchor CA cert (for validating dev-signed content). */
  trustAnchorPem?: string;
}

export interface ManifestValidation {
  /** Whether the manifest passed validation. */
  valid: boolean;
  /** Validation errors (empty if valid). */
  errors: string[];
}

export interface StoreAndPrepareResult {
  /** Original image bytes (unchanged — not re-signed). */
  imageBuffer: Buffer;
  /** ANS-104 tags ready for Arweave upload. */
  tags: Tag[];
  /** Extracted C2PA manifest ID (active manifest label). */
  manifestId: string;
  /** base64url SHA-256 of the original image. */
  assetHash: string;
  /** base64url SHA-256 of the manifest store. */
  manifestStoreHash: string;
  /** Detected content type. */
  contentType: string;
  /** pHash hex string (16 chars). */
  pHashHex: string;
  /** Validation result from c2pa-node Reader. */
  validation: ManifestValidation;
  /** Claim generator from the existing manifest (if present). */
  existingClaimGenerator?: string;
}

/**
 * Extract, validate, and prepare a pre-signed C2PA image for Arweave storage.
 *
 * Unlike signAndPrepare(), this does NOT create a new manifest — it preserves
 * the existing C2PA credentials and uploads the original bytes to Arweave.
 */
export async function storeAndPrepare(
  options: StoreAndPrepareOptions
): Promise<StoreAndPrepareResult> {
  const {
    imageBuffer,
    manifestRepoUrl,
    claimGenerator = 'turbo-c2pa-store/0.1.0',
    requireValidSignature = false,
    trustAnchorPem,
  } = options;

  // 1. Detect content type
  const contentType = detectContentType(new Uint8Array(imageBuffer));
  if (!contentType) {
    throw new Error('Unsupported image format — could not detect content type from magic bytes');
  }

  // 2. Read and validate existing C2PA manifest
  const settingsParts = [createVerifySettings({ verifyAfterSign: false, verifyTrust: true })];

  if (trustAnchorPem) {
    settingsParts.push(
      createTrustSettings({ verifyTrustList: false, trustAnchors: trustAnchorPem })
    );
  }

  const settings = mergeSettings(...settingsParts);

  const reader = await Reader.fromAsset(
    { buffer: imageBuffer, mimeType: contentType },
    settingsToJson(settings)
  );

  if (!reader) {
    throw new Error(
      'No C2PA manifest found in the image. Use signAndPrepare() for unsigned images.'
    );
  }

  // 3. Extract manifest data
  const manifestStore = reader.json();
  const activeLabel = manifestStore.active_manifest;

  if (!activeLabel) {
    throw new Error('C2PA manifest store has no active manifest');
  }

  const activeManifest = manifestStore.manifests?.[activeLabel];
  if (!activeManifest) {
    throw new Error(`Active manifest "${activeLabel}" not found in manifest store`);
  }

  // 4. Check validation status
  const validationErrors: string[] = [];
  if (manifestStore.validation_status && manifestStore.validation_status.length > 0) {
    for (const status of manifestStore.validation_status) {
      validationErrors.push(status.code || JSON.stringify(status));
    }
  }

  const validation: ManifestValidation = {
    valid: validationErrors.length === 0,
    errors: validationErrors,
  };

  if (requireValidSignature && !validation.valid) {
    throw new Error(
      `C2PA manifest failed validation: ${validationErrors.join(', ')}. ` +
        'Set requireValidSignature: false to store anyway.'
    );
  }

  // 5. Compute SHA-256 of original image
  const assetHashRaw = crypto.createHash('sha256').update(imageBuffer).digest();
  const assetHash = assetHashRaw
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 6. Compute manifest store hash
  // In store mode with storage mode "full", the JUMBF manifest bytes are embedded
  // inside the image. Extracting raw JUMBF would require format-specific parsing
  // (JPEG APP11, PNG caBX, etc.). Since the Arweave data item IS the complete
  // image with manifest, we use the same asset hash — the data item hash verifies
  // the integrity of both the asset and the embedded manifest.
  const manifestStoreHash = assetHash;

  // 7. Compute pHash (soft binding)
  const phash = await computePHash(imageBuffer);

  // 8. Use the active manifest label as the manifest ID
  // C2PA manifest labels are typically in the format "contentauth:urn:uuid:..."
  // We normalize to our urn:c2pa: format
  const manifestId = normalizeManifestId(activeLabel);

  // 9. Build ANS-104 tags
  const { tags } = buildTags({
    contentType,
    manifestId,
    storageMode: 'full',
    assetHash,
    manifestStoreHash,
    manifestRepoUrl,
    softBindingAlg: ALG_PHASH,
    softBindingValue: phash.base64,
    claimGenerator,
  });

  return {
    imageBuffer, // Original bytes — unchanged
    tags,
    manifestId,
    assetHash,
    manifestStoreHash,
    contentType,
    pHashHex: phash.hex,
    validation,
    existingClaimGenerator:
      activeManifest.claim_generator ||
      activeManifest.claim_generator_info
        ?.map((g: { name: string; version?: string }) => `${g.name}/${g.version || ''}`)
        .join(', '),
  };
}

/**
 * Normalize a C2PA manifest label to our urn:c2pa: format.
 *
 * c2pa-node labels are typically "contentauth:urn:uuid:..." or similar.
 * We preserve the original if it already has a URN-like format.
 */
function normalizeManifestId(label: string): string {
  // If it already looks like our format, use as-is
  if (label.startsWith('urn:c2pa:')) {
    return label;
  }

  // Extract UUID from contentauth labels like "contentauth:urn:uuid:abc-123"
  const uuidMatch = label.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (uuidMatch) {
    return `urn:c2pa:${uuidMatch[1]}`;
  }

  // Fallback: use the full label as the identifier
  return `urn:c2pa:${label}`;
}
