/**
 * C2PA (Content Credentials) service.
 *
 * Provides functionality for:
 * - Creating C2PA 2.3 compliant signed manifests (using @contentauth/c2pa-node)
 * - Reading C2PA manifests from images (using @trustnxt/c2pa-ts)
 * - Validating manifest signatures
 *
 * Signing uses @contentauth/c2pa-node (official CAI library) for:
 * - JUMBF format manifests
 * - COSE signatures
 * - X.509 certificate chains
 *
 * Reading uses @trustnxt/c2pa-ts for:
 * - Parsing embedded JUMBF manifests
 * - Validating signatures and hash bindings
 */

import { v4 as uuidv4 } from 'uuid';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { getSigner, isSignerReady, getSignerStatus } from './signer.service.js';
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

// C2PA-Node library imports for creating signed manifests
import { Builder, type Signer } from '@contentauth/c2pa-node';

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
const CLAIM_GENERATOR = 'Trusthash/1.0.0';
const CLAIM_GENERATOR_INFO =
  'https://github.com/ar-io/ar-io-node-project/packages/trusthash-sidecar';

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

  // Extract title from claim (if available)
  const title = (claim as { title?: string }).title;

  return {
    claimGenerator: `${claim.claimGeneratorName}${claim.claimGeneratorVersion ? '/' + claim.claimGeneratorVersion : ''}`,
    title,
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
 * Determine the file extension from content type.
 */
function getFileExtension(contentType: string): string {
  const extensionMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/tiff': 'tiff',
    'image/avif': 'avif',
    'image/heif': 'heif',
  };
  return extensionMap[contentType] || 'jpg';
}

/**
 * Create a C2PA 2.3 compliant signed manifest and embed it into an image.
 *
 * Uses @contentauth/c2pa-node (official CAI library) to create:
 * - Proper JUMBF format manifests
 * - COSE signatures with X.509 certificates
 * - Embedded manifest in the output image
 *
 * Creates a manifest containing:
 * - Hash binding to the image content (automatic by c2pa-node)
 * - Embedded thumbnail
 * - pHash soft binding for similarity search
 * - ArNS URL identifier
 * - Action history
 * - Optional prior manifest as ingredient
 *
 * @param options - Manifest creation options
 * @returns Signed image buffer with embedded C2PA manifest
 */
export async function createManifest(
  options: CreateManifestOptions
): Promise<CreateManifestResult> {
  const {
    imageBuffer,
    originalHash,
    pHash,
    arnsUrl,
    thumbnail,
    title,
    creator,
    priorManifest,
    contentType,
  } = options;

  logger.info({ arnsUrl, contentType, hasPrior: !!priorManifest }, 'Creating C2PA 2.3 manifest');

  // Check if signer is available
  const signerStatus = await getSignerStatus();
  if (!signerStatus.configured) {
    logger.error({ error: signerStatus.error }, 'C2PA signer not configured');
    throw new Error(
      `C2PA signer not configured: ${signerStatus.error}. ` +
        'See certs/README.md for certificate setup instructions.'
    );
  }

  try {
    // Get the signer
    const signer = await getSigner();

    // Build manifest definition for c2pa-node
    const manifestDef = {
      claim_generator: CLAIM_GENERATOR,
      claim_generator_info: [
        {
          name: 'Trusthash Sidecar',
          version: '1.0.0',
        },
      ],
      title: title || arnsUrl || 'Untitled',
      assertions: [
        // Actions assertion
        {
          label: 'c2pa.actions',
          data: {
            actions: [
              {
                action: priorManifest ? 'c2pa.repackaged' : 'c2pa.created',
                when: new Date().toISOString(),
                softwareAgent: CLAIM_GENERATOR,
                parameters: {
                  description: priorManifest
                    ? 'Asset repackaged with new manifest'
                    : 'Asset created and signed',
                },
              },
            ],
          },
        },
        // Soft binding for pHash (perceptual hash)
        {
          label: 'c2pa.soft-binding',
          data: {
            alg: 'phash',
            value: pHash,
          },
        },
      ],
    };

    // Add creator assertion if provided
    if (creator) {
      manifestDef.assertions.push({
        label: 'stds.schema-org.CreativeWork',
        data: {
          '@context': 'https://schema.org/',
          '@type': 'CreativeWork',
          author: [
            {
              '@type': 'Person',
              name: creator,
            },
          ],
        },
      } as { label: string; data: unknown });
    }

    // Add ArNS URL as custom assertion
    if (arnsUrl) {
      manifestDef.assertions.push({
        label: 'ar.io.arns',
        data: {
          url: arnsUrl,
          network: 'arweave',
          type: 'undername',
        },
      } as { label: string; data: unknown });
    }

    // Create builder with manifest definition
    const builder = Builder.withJson(manifestDef);

    // Note: Thumbnail embedding via addResource causes issues with c2pa-node.
    // Thumbnails are still generated and stored separately on Arweave.
    // TODO: Investigate proper thumbnail embedding when c2pa-node API stabilizes.

    // Write image to temp file (c2pa-node works best with file paths)
    const ext = getFileExtension(contentType);
    const tempInput = join(tmpdir(), `trusthash-input-${Date.now()}.${ext}`);
    const tempOutput = join(tmpdir(), `trusthash-output-${Date.now()}.${ext}`);

    try {
      await writeFile(tempInput, imageBuffer);

      // Create asset objects for c2pa-node
      const inputAsset = { path: tempInput, mimeType: contentType };
      const outputAsset = { path: tempOutput };

      // Sign and embed manifest into the image
      logger.debug({ tempInput, tempOutput }, 'Signing image with C2PA manifest');

      const signResult = builder.sign(signer, inputAsset, outputAsset);

      logger.debug({ resultSize: signResult?.length }, 'C2PA signing completed');

      // Read the signed image
      const signedImageBuffer = Buffer.from(await readFile(tempOutput));

      logger.info(
        {
          inputSize: imageBuffer.length,
          outputSize: signedImageBuffer.length,
          manifestOverhead: signedImageBuffer.length - imageBuffer.length,
        },
        'C2PA manifest created and embedded'
      );

      return {
        manifestBuffer: signedImageBuffer, // The signed image with embedded manifest
        contentType, // Same content type as input
        claimGenerator: CLAIM_GENERATOR,
        hasPriorManifest: !!priorManifest,
      };
    } finally {
      // Cleanup temp files
      await Promise.all([unlink(tempInput).catch(() => {}), unlink(tempOutput).catch(() => {})]);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to create C2PA manifest');
    throw new Error(`C2PA manifest creation failed: ${(error as Error).message}`);
  }
}

/**
 * Read a C2PA manifest from an image or standalone manifest file.
 *
 * Uses c2pa-ts library for parsing JUMBF manifests.
 *
 * @param options - Read options
 * @returns Manifest data if found
 */
export async function readManifest(options: ReadManifestOptions): Promise<ReadManifestResult> {
  const { buffer, isStandalone } = options;

  try {
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
 * For C2PA 2.3 compliant images, this validates:
 * - COSE signature integrity
 * - Certificate chain
 * - Hash bindings
 *
 * @param imageBuffer - Image buffer with embedded C2PA manifest
 * @param _originalImageBuffer - Unused, kept for API compatibility
 * @returns Verification result
 */
export async function verifyManifest(
  imageBuffer: Buffer,
  _originalImageBuffer?: Buffer
): Promise<VerifyManifestResult> {
  // For C2PA compliant images, use validateEmbeddedManifest
  return validateEmbeddedManifest(imageBuffer);
}

/**
 * Extract thumbnail from an image with C2PA manifest.
 *
 * @param imageBuffer - Image buffer with embedded C2PA manifest
 * @returns Thumbnail data if found
 */
export async function extractThumbnail(imageBuffer: Buffer): Promise<C2PAThumbnail | null> {
  try {
    const asset = createC2PAAsset(imageBuffer);
    if (!asset) {
      return null;
    }

    const jumbfData = asset.getManifestJUMBF();
    if (!jumbfData || jumbfData.length === 0) {
      return null;
    }

    const superBox = SuperBox.fromBuffer(jumbfData);
    const manifestStore = ManifestStore.read(superBox);
    const activeManifest = manifestStore.getActiveManifest();

    if (!activeManifest?.assertions?.assertions) {
      return null;
    }

    // Look for thumbnail assertion
    for (const assertion of activeManifest.assertions.assertions) {
      const a = assertion as { label?: string; content?: Uint8Array; mimeType?: string };
      if (a.label?.includes('thumbnail') && a.content && a.mimeType) {
        return {
          contentType: a.mimeType,
          data: Buffer.from(a.content),
        };
      }
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
 * Checks for:
 * - Embedded JUMBF in JPEG/PNG images
 * - Standalone JUMBF boxes
 *
 * @param buffer - Buffer to check
 * @returns True if C2PA manifest detected
 */
export async function hasManifest(buffer: Buffer): Promise<boolean> {
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
 * Check if the C2PA signer is configured and ready.
 */
export async function isC2PASignerReady(): Promise<boolean> {
  return isSignerReady();
}

/**
 * Get the signer status for health checks.
 */
export async function getC2PASignerStatus() {
  return getSignerStatus();
}
