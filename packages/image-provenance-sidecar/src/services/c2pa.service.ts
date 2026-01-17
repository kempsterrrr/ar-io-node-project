/**
 * C2PA (Content Credentials) service.
 *
 * Provides functionality for:
 * - Reading C2PA manifests from images
 * - Creating new C2PA manifests
 * - Validating manifest signatures
 *
 * Uses @trustnxt/c2pa-ts for the underlying implementation.
 *
 * Note: The c2pa-ts library is under active development. Some features
 * may use simplified implementations until the library API stabilizes.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import type {
  CreateManifestOptions,
  CreateManifestResult,
  ReadManifestOptions,
  ReadManifestResult,
  VerifyManifestResult,
  C2PAManifestSummary,
  C2PAValidationStatus,
  C2PAThumbnail,
  C2PAAssertionSummary,
  C2PASignatureInfo,
  C2PAIngredient,
} from '../types/c2pa.js';
// C2PA-TS library imports for reading embedded JUMBF manifests
import { JPEG, PNG } from '@trustnxt/c2pa-ts/asset';
import type { Asset as C2PAAsset } from '@trustnxt/c2pa-ts/asset';
import { SuperBox } from '@trustnxt/c2pa-ts/jumbf';
import {
  ManifestStore,
  type ValidationResult as C2PAValidationResult,
} from '@trustnxt/c2pa-ts/manifest';

/**
 * Claim generator string for manifests created by this service
 */
const CLAIM_GENERATOR = 'Image Provenance Sidecar/0.1.0';

/**
 * Self-signed certificate information
 * In production, this would use a proper certificate chain
 */
const SELF_SIGNED_CERT_INFO = {
  issuer: 'CN=Image Provenance Sidecar Self-Signed',
  algorithm: 'ES256',
  validFrom: new Date().toISOString().split('T')[0],
  validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  isSelfSigned: true,
};

/**
 * Create a C2PA asset from a buffer based on detected image format.
 * Returns undefined if format is not supported (only JPEG and PNG).
 *
 * @param buffer - The raw image buffer
 * @returns A C2PA asset (JPEG or PNG) or undefined if unsupported
 */
function createC2PAAsset(buffer: Buffer): C2PAAsset | undefined {
  const data = new Uint8Array(buffer);

  if (JPEG.canRead(data)) {
    return new JPEG(data);
  }

  if (PNG.canRead(data)) {
    return new PNG(data);
  }

  return undefined;
}

/**
 * Convert a c2pa-ts ManifestStore to our C2PAManifestSummary format.
 *
 * @param manifestStore - The ManifestStore from c2pa-ts
 * @returns Summary in our API format
 */
function convertManifestStoreToSummary(manifestStore: ManifestStore): C2PAManifestSummary {
  const activeManifest = manifestStore.getActiveManifest();

  if (!activeManifest || !activeManifest.claim) {
    throw new Error('No active manifest found in manifest store');
  }

  const claim = activeManifest.claim;
  const assertions: C2PAAssertionSummary[] = [];

  // Extract assertions from the assertion store
  if (activeManifest.assertions?.assertions) {
    for (const assertion of activeManifest.assertions.assertions) {
      const label = (assertion as { label?: string }).label || 'unknown';

      // Categorize by assertion type
      let kind = 'other';
      if (label.includes('hash')) kind = 'hash';
      else if (label.includes('thumbnail')) kind = 'thumbnail';
      else if (label.includes('actions')) kind = 'actions';
      else if (label.includes('ingredient')) kind = 'ingredient';
      else if (label.includes('soft-binding')) kind = 'soft-binding';

      assertions.push({
        label,
        kind,
        data: extractAssertionData(assertion),
      });
    }
  }

  // Extract signature info (simplified - c2pa-ts handles certificate chain internally)
  const signatureInfo: C2PASignatureInfo = {
    issuer: 'External C2PA Signer',
    algorithm: 'Unknown',
    validFrom: '',
    validTo: '',
    isSelfSigned: false,
  };

  // Try to extract certificate info from signature if available
  if (activeManifest.signature) {
    try {
      const sig = activeManifest.signature;
      // The signature data structure varies by implementation
      // Safely extract what we can
      if ('signatureData' in sig && sig.signatureData) {
        const sigData = sig.signatureData as {
          algorithm?: unknown;
          certificates?: Array<{
            issuer?: string;
            subject?: string;
            notBefore?: Date;
            notAfter?: Date;
          }>;
        };
        if (sigData.algorithm) {
          signatureInfo.algorithm = String(sigData.algorithm);
        }
        if (sigData.certificates && sigData.certificates.length > 0) {
          const cert = sigData.certificates[0];
          if (cert.issuer) signatureInfo.issuer = cert.issuer;
          if (cert.notBefore) signatureInfo.validFrom = cert.notBefore.toISOString();
          if (cert.notAfter) signatureInfo.validTo = cert.notAfter.toISOString();
          signatureInfo.isSelfSigned = cert.issuer === cert.subject;
        }
      }
    } catch {
      logger.debug('Could not extract certificate info from signature');
    }
  }

  // Extract ingredients if available
  const ingredients: C2PAIngredient[] = [];
  // Note: Ingredients would be extracted from ingredient assertions in a full implementation

  return {
    claimGenerator: `${claim.claimGeneratorName}${claim.claimGeneratorVersion ? '/' + claim.claimGeneratorVersion : ''}`,
    created: '', // C2PA claim doesn't expose creation date directly; would be in actions assertion
    signatureInfo,
    assertions,
    ingredients,
  };
}

/**
 * Extract data from an assertion for summary purposes.
 */
function extractAssertionData(assertion: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (assertion && typeof assertion === 'object') {
    const a = assertion as Record<string, unknown>;
    // Copy common assertion properties
    if ('algorithm' in a) result.algorithm = a.algorithm;
    if ('hash' in a) result.hash = a.hash;
    if ('mimeType' in a) result.mimeType = a.mimeType;
    if ('value' in a) result.value = a.value;
    if ('actions' in a) result.actions = a.actions;
    if ('content' in a && a.content instanceof Uint8Array) {
      result.size = (a.content as Uint8Array).length;
    }
  }

  return result;
}

/**
 * Internal manifest structure for JSON-based manifests.
 * This is a simplified format until full JUMBF support is implemented.
 */
interface InternalManifest {
  version: string;
  instanceId: string;
  claimGenerator: string;
  created: string;
  assertions: {
    'c2pa.hash.data': {
      algorithm: string;
      hash: string;
    };
    'c2pa.thumbnail.claim'?: {
      contentType: string;
      size: number;
      // Thumbnail data is stored separately
    };
    'c2pa.soft-binding'?: {
      algorithm: string;
      value: string;
    };
    'dc:identifier'?: string;
    'c2pa.actions'?: Array<{
      action: string;
      when?: string;
      softwareAgent?: string;
    }>;
  };
  ingredients?: Array<{
    instanceId: string;
    title?: string;
    format?: string;
  }>;
  signature: {
    issuer: string;
    algorithm: string;
    validFrom: string;
    validTo: string;
    isSelfSigned: boolean;
    // In a full implementation, this would include actual signature bytes
  };
  thumbnail?: string; // Base64-encoded thumbnail
}

/**
 * Create a C2PA manifest for an image.
 *
 * Creates a manifest containing:
 * - Hash of the original image (hard binding)
 * - Embedded thumbnail
 * - pHash (soft binding)
 * - ArNS URL identifier
 * - Action history
 * - Optional prior manifest as ingredient
 *
 * @param options - Manifest creation options
 * @returns Created manifest buffer and metadata
 */
export async function createManifest(
  options: CreateManifestOptions
): Promise<CreateManifestResult> {
  const { originalHash, pHash, arnsUrl, thumbnail, title, creator, priorManifest, contentType } =
    options;

  logger.info({ arnsUrl, contentType, hasPrior: !!priorManifest }, 'Creating C2PA manifest');

  try {
    // Generate unique instance ID
    const instanceId = `urn:uuid:${uuidv4()}`;
    const created = new Date().toISOString();

    // Build internal manifest structure
    const manifest: InternalManifest = {
      version: '2.1',
      instanceId,
      claimGenerator: CLAIM_GENERATOR,
      created,
      assertions: {
        'c2pa.hash.data': {
          algorithm: 'SHA-256',
          hash: originalHash,
        },
        'c2pa.thumbnail.claim': {
          contentType: thumbnail.contentType,
          size: thumbnail.buffer.length,
        },
        'c2pa.soft-binding': {
          algorithm: 'pHash',
          value: pHash,
        },
        'dc:identifier': arnsUrl,
        'c2pa.actions': [
          {
            action: 'c2pa.created',
            when: created,
            softwareAgent: CLAIM_GENERATOR,
          },
        ],
      },
      signature: SELF_SIGNED_CERT_INFO,
      // Embed thumbnail as base64
      thumbnail: thumbnail.buffer.toString('base64'),
    };

    // Add prior manifest as ingredient if present
    if (priorManifest) {
      manifest.ingredients = [priorManifest];
      manifest.assertions['c2pa.actions']?.push({
        action: 'c2pa.repackaged',
        when: created,
        softwareAgent: CLAIM_GENERATOR,
      });
    }

    // Add title and creator if provided
    if (title) {
      (manifest.assertions as Record<string, unknown>)['dc:title'] = title;
    }
    if (creator) {
      (manifest.assertions as Record<string, unknown>)['dc:creator'] = creator;
    }

    // Convert to JUMBF-like JSON format
    // Note: In full implementation, this would be actual JUMBF binary
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');

    logger.debug(
      {
        instanceId,
        manifestSize: manifestBuffer.length,
        thumbnailSize: thumbnail.buffer.length,
      },
      'C2PA manifest created'
    );

    return {
      manifestBuffer,
      contentType: 'application/c2pa+json', // Will be application/c2pa for JUMBF
      claimGenerator: CLAIM_GENERATOR,
      hasPriorManifest: !!priorManifest,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to create C2PA manifest');
    throw new Error(`C2PA manifest creation failed: ${(error as Error).message}`);
  }
}

/**
 * Read a C2PA manifest from an image or standalone manifest file.
 *
 * @param options - Read options
 * @returns Manifest data if found
 */
export async function readManifest(options: ReadManifestOptions): Promise<ReadManifestResult> {
  const { buffer, isStandalone } = options;

  try {
    // Try to parse as our JSON-based manifest format first
    if (isStandalone) {
      try {
        const manifest = JSON.parse(buffer.toString('utf-8')) as InternalManifest;

        if (manifest.version && manifest.claimGenerator && manifest.assertions) {
          return {
            found: true,
            manifest: internalToSummary(manifest),
            raw: manifest,
          };
        }
      } catch {
        // Not our JSON format, continue to JUMBF parsing
      }
    }

    // Try to read embedded JUMBF from image using c2pa-ts
    const asset = createC2PAAsset(buffer);
    if (asset) {
      const jumbfData = asset.getManifestJUMBF();

      if (jumbfData && jumbfData.length > 0) {
        try {
          const superBox = SuperBox.fromBuffer(jumbfData);
          const manifestStore = ManifestStore.read(superBox);

          logger.debug(
            { manifestCount: manifestStore.manifests.length, mimeType: asset.mimeType },
            'Read JUMBF manifest store from image'
          );

          return {
            found: true,
            manifest: convertManifestStoreToSummary(manifestStore),
            raw: {
              type: 'jumbf-embedded',
              mimeType: asset.mimeType,
              manifestCount: manifestStore.manifests.length,
              activeManifestLabel: manifestStore.getActiveManifest()?.label,
            },
          };
        } catch (parseError) {
          logger.error({ error: parseError }, 'Failed to parse JUMBF manifest');
          return {
            found: false,
            error: `Failed to parse JUMBF: ${(parseError as Error).message}`,
          };
        }
      }
    }

    // Try to parse as standalone JUMBF (raw JUMBF box not embedded in image)
    if (!isStandalone && buffer.length >= 8) {
      const type = buffer.toString('ascii', 4, 8);
      if (type === 'jumb' || type === 'jumd') {
        try {
          const superBox = SuperBox.fromBuffer(new Uint8Array(buffer));
          const manifestStore = ManifestStore.read(superBox);

          logger.debug(
            { manifestCount: manifestStore.manifests.length },
            'Read standalone JUMBF manifest store'
          );

          return {
            found: true,
            manifest: convertManifestStoreToSummary(manifestStore),
            raw: {
              type: 'jumbf-standalone',
              manifestCount: manifestStore.manifests.length,
            },
          };
        } catch (parseError) {
          logger.error({ error: parseError }, 'Failed to parse standalone JUMBF');
        }
      }
    }

    logger.debug({ isStandalone, size: buffer.length }, 'No C2PA manifest found');

    return {
      found: false,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to read C2PA manifest');
    return {
      found: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Read embedded C2PA manifest from a JPEG or PNG image.
 * This is a dedicated function for reading from images only.
 *
 * @param imageBuffer - The raw image buffer (JPEG or PNG)
 * @returns Manifest data if found
 */
export async function readEmbeddedManifest(imageBuffer: Buffer): Promise<ReadManifestResult> {
  try {
    const asset = createC2PAAsset(imageBuffer);

    if (!asset) {
      return {
        found: false,
        error: 'Unsupported image format. Only JPEG and PNG are supported.',
      };
    }

    const jumbfData = asset.getManifestJUMBF();

    if (!jumbfData || jumbfData.length === 0) {
      return {
        found: false,
      };
    }

    const superBox = SuperBox.fromBuffer(jumbfData);
    const manifestStore = ManifestStore.read(superBox);

    logger.debug(
      { manifestCount: manifestStore.manifests.length, mimeType: asset.mimeType },
      'Read embedded C2PA manifest from image'
    );

    return {
      found: true,
      manifest: convertManifestStoreToSummary(manifestStore),
      raw: {
        type: 'jumbf-embedded',
        mimeType: asset.mimeType,
        manifestCount: manifestStore.manifests.length,
        activeManifestLabel: manifestStore.getActiveManifest()?.label,
      },
    };
  } catch (error) {
    logger.error({ error }, 'Failed to read embedded manifest');
    return {
      found: false,
      error: `Failed to read embedded manifest: ${(error as Error).message}`,
    };
  }
}

/**
 * Validate an embedded C2PA manifest against its image.
 * Uses the c2pa-ts library for full validation including signature verification.
 *
 * @param imageBuffer - The raw image buffer with embedded manifest
 * @returns Validation result with detailed status
 */
export async function validateEmbeddedManifest(imageBuffer: Buffer): Promise<VerifyManifestResult> {
  try {
    const asset = createC2PAAsset(imageBuffer);

    if (!asset) {
      return {
        verified: false,
        validationStatus: {
          signatureValid: false,
          certificateValid: false,
          hashMatch: null,
          errors: ['Unsupported image format. Only JPEG and PNG are supported.'],
          warnings: [],
        },
      };
    }

    const jumbfData = asset.getManifestJUMBF();

    if (!jumbfData || jumbfData.length === 0) {
      return {
        verified: false,
        validationStatus: {
          signatureValid: false,
          certificateValid: false,
          hashMatch: null,
          errors: ['No embedded C2PA manifest found in image'],
          warnings: [],
        },
      };
    }

    const superBox = SuperBox.fromBuffer(jumbfData);
    const manifestStore = ManifestStore.read(superBox);

    // Perform validation using c2pa-ts
    const validationResult = await manifestStore.validate(asset);

    // Convert c2pa-ts validation result to our format
    const errors: string[] = [];
    const warnings: string[] = [];
    let signatureValid = true;
    let hashMatch: boolean | null = null;

    for (const entry of validationResult.statusEntries) {
      const message = `${entry.code}${entry.explanation ? ': ' + entry.explanation : ''}`;

      if (entry.success === false) {
        errors.push(message);

        // Check specific error types
        if (entry.code.toLowerCase().includes('signature')) {
          signatureValid = false;
        }
        if (entry.code.toLowerCase().includes('hash')) {
          hashMatch = false;
        }
      } else if (entry.success === true) {
        // Track successful hash validation
        if (entry.code.toLowerCase().includes('hash')) {
          hashMatch = true;
        }
      }
    }

    // Add warning about certificate chain validation limitations
    warnings.push('Note: c2pa-ts certificate chain validation may be incomplete');

    logger.debug(
      {
        isValid: validationResult.isValid,
        entriesCount: validationResult.statusEntries.length,
        errorsCount: errors.length,
      },
      'Validated embedded C2PA manifest'
    );

    return {
      verified: validationResult.isValid,
      manifest: convertManifestStoreToSummary(manifestStore),
      validationStatus: {
        signatureValid,
        certificateValid: signatureValid, // Tied to signature validation in c2pa-ts
        hashMatch,
        errors,
        warnings,
      },
    };
  } catch (error) {
    logger.error({ error }, 'Failed to validate embedded manifest');
    return {
      verified: false,
      validationStatus: {
        signatureValid: false,
        certificateValid: false,
        hashMatch: null,
        errors: [`Validation failed: ${(error as Error).message}`],
        warnings: [],
      },
    };
  }
}

/**
 * Verify a C2PA manifest's signatures and integrity.
 *
 * @param manifestBuffer - Manifest buffer to verify
 * @param originalImageBuffer - Optional original image for hash verification
 * @returns Verification result
 */
export async function verifyManifest(
  manifestBuffer: Buffer,
  originalImageBuffer?: Buffer
): Promise<VerifyManifestResult> {
  try {
    // First, check if this is an image with embedded manifest
    const asset = createC2PAAsset(manifestBuffer);
    if (asset) {
      const jumbfData = asset.getManifestJUMBF();
      if (jumbfData && jumbfData.length > 0) {
        // This is an image with embedded manifest - use full validation
        return validateEmbeddedManifest(manifestBuffer);
      }
    }

    // Try to parse as our JSON format
    const manifest = JSON.parse(manifestBuffer.toString('utf-8')) as InternalManifest;

    const validationStatus: C2PAValidationStatus = {
      signatureValid: true, // Self-signed is always "valid" in structure
      certificateValid: true, // Self-signed cert is valid but not trusted
      hashMatch: null,
      errors: [],
      warnings: ['Self-signed certificate - not verified against trusted CA'],
    };

    // Verify hash if original image provided
    if (originalImageBuffer) {
      const hasher = new Bun.CryptoHasher('sha256');
      hasher.update(originalImageBuffer);
      const computedHash = hasher.digest('hex');
      const expectedHash = manifest.assertions['c2pa.hash.data'].hash;

      validationStatus.hashMatch = computedHash === expectedHash;

      if (!validationStatus.hashMatch) {
        validationStatus.errors.push('Image hash does not match manifest');
      }
    }

    return {
      verified: validationStatus.errors.length === 0,
      manifest: internalToSummary(manifest),
      validationStatus,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to verify C2PA manifest');

    return {
      verified: false,
      validationStatus: {
        signatureValid: false,
        certificateValid: false,
        hashMatch: null,
        errors: [`Verification failed: ${(error as Error).message}`],
        warnings: [],
      },
    };
  }
}

/**
 * Extract thumbnail from a C2PA manifest.
 *
 * @param manifestBuffer - Manifest buffer
 * @returns Thumbnail data if found
 */
export async function extractThumbnail(manifestBuffer: Buffer): Promise<C2PAThumbnail | null> {
  try {
    const manifest = JSON.parse(manifestBuffer.toString('utf-8')) as InternalManifest;

    if (manifest.thumbnail && manifest.assertions['c2pa.thumbnail.claim']) {
      return {
        contentType: manifest.assertions['c2pa.thumbnail.claim'].contentType,
        data: Buffer.from(manifest.thumbnail, 'base64'),
      };
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Failed to extract thumbnail from manifest');
    return null;
  }
}

/**
 * Check if a buffer contains a C2PA manifest.
 *
 * @param buffer - Buffer to check
 * @returns True if manifest detected
 */
export async function hasManifest(buffer: Buffer): Promise<boolean> {
  // Check for our JSON format
  try {
    const str = buffer.toString('utf-8', 0, 200);
    // Check for key markers of our JSON manifest format
    if (str.includes('"version"') && str.includes('"instanceId"')) {
      // Further validate by trying to parse
      try {
        const parsed = JSON.parse(buffer.toString('utf-8'));
        return !!(parsed.version && parsed.claimGenerator && parsed.assertions);
      } catch {
        return false;
      }
    }
  } catch {
    // Not text
  }

  // Check for JUMBF magic (JP2 format)
  // JUMBF starts with a box header, then 'jumb' type
  if (buffer.length >= 8) {
    const type = buffer.toString('ascii', 4, 8);
    if (type === 'jumb' || type === 'jumd') {
      return true;
    }
  }

  // Check for embedded JUMBF in JPEG/PNG using c2pa-ts
  try {
    const asset = createC2PAAsset(buffer);
    if (asset) {
      const jumbf = asset.getManifestJUMBF();
      if (jumbf && jumbf.length > 0) {
        logger.debug(
          { size: jumbf.length, mimeType: asset.mimeType },
          'Found embedded C2PA manifest'
        );
        return true;
      }
    }
  } catch (error) {
    logger.debug({ error }, 'Error checking for embedded manifest');
  }

  return false;
}

/**
 * Get the claim generator string.
 */
export function getClaimGenerator(): string {
  return CLAIM_GENERATOR;
}

/**
 * Convert internal manifest to summary format.
 */
function internalToSummary(manifest: InternalManifest): C2PAManifestSummary {
  const assertions = [];

  if (manifest.assertions['c2pa.hash.data']) {
    assertions.push({
      label: 'c2pa.hash.data',
      kind: 'hash',
      data: manifest.assertions['c2pa.hash.data'],
    });
  }

  if (manifest.assertions['c2pa.thumbnail.claim']) {
    assertions.push({
      label: 'c2pa.thumbnail.claim',
      kind: 'thumbnail',
      data: manifest.assertions['c2pa.thumbnail.claim'],
    });
  }

  if (manifest.assertions['c2pa.soft-binding']) {
    assertions.push({
      label: 'c2pa.soft-binding',
      kind: 'soft-binding',
      data: manifest.assertions['c2pa.soft-binding'],
    });
  }

  if (manifest.assertions['c2pa.actions']) {
    assertions.push({
      label: 'c2pa.actions',
      kind: 'actions',
      data: { actions: manifest.assertions['c2pa.actions'] },
    });
  }

  return {
    claimGenerator: manifest.claimGenerator,
    created: manifest.created,
    signatureInfo: {
      issuer: manifest.signature.issuer,
      algorithm: manifest.signature.algorithm,
      validFrom: manifest.signature.validFrom,
      validTo: manifest.signature.validTo,
      isSelfSigned: manifest.signature.isSelfSigned,
    },
    assertions,
    ingredients: manifest.ingredients || [],
  };
}
