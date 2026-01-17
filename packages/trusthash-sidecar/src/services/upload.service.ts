/**
 * Upload service for C2PA manifest creation and Arweave storage.
 *
 * Orchestrates the complete upload flow:
 * 1. Validate image
 * 2. Compute pHash
 * 3. Generate thumbnail
 * 4. Create ArNS undername
 * 5. Create C2PA manifest
 * 6. Upload manifest to Arweave via Turbo
 * 7. Update ArNS undername to point to manifest
 * 8. Index in DuckDB
 */

import { ArweaveSigner, TurboFactory, TurboAuthenticatedClient } from '@ardrive/turbo-sdk';
import { Readable } from 'stream';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { computePHash } from './phash.service.js';
import { generateThumbnail, validateImage, computeImageHash } from './thumbnail.service.js';
import { createManifest, readManifest, extractManifestJUMBF } from './c2pa.service.js';
import {
  createUndername,
  updateUndername,
  buildArnsUrl,
  getWalletAddress,
  isArnsConfigured,
} from './arns.service.js';
import { insertManifest } from '../db/index.js';
import type { C2PAIngredient, StorageMode } from '../types/c2pa.js';

/**
 * Upload request options
 */
export interface UploadOptions {
  /** Original image buffer */
  imageBuffer: Buffer;
  /** Image content type */
  contentType: string;
  /** Optional title for the image */
  title?: string;
  /** Optional creator name */
  creator?: string;
  /** Storage mode: standard (default), minimal, or full */
  storageMode?: StorageMode;
}

/**
 * Upload result
 */
export interface UploadResult {
  /** Success indicator */
  success: boolean;
  /** Data payload (on success) */
  data?: {
    /** Arweave transaction ID of the JUMBF sidecar manifest (all modes) */
    manifestTxId: string;
    /** Arweave transaction ID of the full signed image (full mode only) */
    signedImageTxId?: string;
    /** ArNS undername */
    arnsUndername: string;
    /** Full ArNS URL */
    arnsUrl: string;
    /** pHash of the image (hex format) */
    phash: string;
    /** SHA-256 hash of the original image */
    originalHash: string;
    /** Whether the image had a prior C2PA manifest */
    hasPriorManifest: boolean;
    /** Content type of original image */
    contentType: string;
    /** Storage mode used for this upload */
    storageMode: StorageMode;
    /** Signed image with embedded C2PA manifest (base64) - always returned */
    signedImage: string;
    /** Arweave transaction ID of thumbnail (standard/full modes only) */
    thumbnailTxId?: string;
  };
  /** Error message (on failure) */
  error?: string;
}

// Singleton Turbo client (lazily initialized)
let turboClient: TurboAuthenticatedClient | null = null;

/**
 * Initialize the Turbo client with signer from wallet file.
 */
async function getTurboClient(): Promise<TurboAuthenticatedClient> {
  if (turboClient) {
    return turboClient;
  }

  try {
    // Load wallet from file
    const walletFile = Bun.file(config.ARWEAVE_WALLET_FILE);
    if (!(await walletFile.exists())) {
      throw new Error(`Wallet file not found: ${config.ARWEAVE_WALLET_FILE}`);
    }

    const jwk = await walletFile.json();
    const signer = new ArweaveSigner(jwk);

    turboClient = TurboFactory.authenticated({
      signer,
      gatewayUrl: config.TURBO_GATEWAY_URL,
    });

    logger.info({ gatewayUrl: config.TURBO_GATEWAY_URL }, 'Turbo client initialized');

    return turboClient;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Turbo client');
    throw new Error(`Turbo initialization failed: ${(error as Error).message}`);
  }
}

/**
 * Upload an image and create a C2PA manifest.
 *
 * Complete flow:
 * 1. Validate the image
 * 2. Check for existing C2PA manifest
 * 3. Compute pHash and SHA-256 hash
 * 4. Generate thumbnail
 * 5. Create ArNS undername (placeholder)
 * 6. Create C2PA manifest with all data
 * 7. Upload manifest to Arweave via Turbo
 * 8. Update ArNS undername to point to manifest
 * 9. Index in local database
 *
 * @param options - Upload options
 * @returns Upload result with manifest details
 */
export async function uploadImage(options: UploadOptions): Promise<UploadResult> {
  const { imageBuffer, contentType, title, creator, storageMode = 'standard' } = options;

  logger.info(
    {
      contentType,
      size: imageBuffer.length,
      hasTitle: !!title,
      storageMode,
    },
    'Starting image upload'
  );

  try {
    // Step 1: Validate image
    const validation = await validateImage(imageBuffer);
    if (!validation.valid) {
      return {
        success: false,
        error: `Image validation failed: ${validation.errors.join(', ')}`,
      };
    }

    logger.debug({ metadata: validation.metadata }, 'Image validated');

    // Step 2: Check for existing C2PA manifest
    let priorManifest: C2PAIngredient | undefined;
    const existingManifest = await readManifest({ buffer: imageBuffer });
    if (existingManifest.found && existingManifest.manifest) {
      priorManifest = {
        instanceId: `urn:uuid:${Date.now()}`, // Generate unique ID
        title: 'Original manifest',
        format: contentType,
        manifestData: {
          claimGenerator: existingManifest.manifest.claimGenerator,
          created: existingManifest.manifest.created,
        },
      };
      logger.info('Found existing C2PA manifest, will preserve as ingredient');
    }

    // Step 3: Compute pHash and SHA-256 hash (in parallel)
    const [phashResult, originalHash] = await Promise.all([
      computePHash(imageBuffer),
      computeImageHash(imageBuffer),
    ]);

    logger.debug(
      {
        phash: phashResult.hex,
        originalHash: originalHash.slice(0, 16) + '...',
      },
      'Computed image hashes'
    );

    // Step 4: Generate thumbnail (skip for minimal mode)
    let thumbnail: { buffer: Buffer; contentType: string; size: number } | undefined;
    if (storageMode !== 'minimal') {
      thumbnail = await generateThumbnail(imageBuffer);
      logger.debug({ thumbnailSize: thumbnail.size }, 'Generated thumbnail');
    } else {
      logger.debug('Skipping thumbnail generation (minimal mode)');
    }

    // Step 5: Create ArNS undername
    // First, we need to create a placeholder - we'll update it after upload
    let arnsUndername: string;
    let arnsUrl: string;

    if (isArnsConfigured()) {
      // Create undername with a placeholder transaction ID
      // We'll update it after the manifest is uploaded
      const placeholderTxId = '0'.repeat(43); // Placeholder
      const undernameResult = await createUndername({
        transactionId: placeholderTxId,
        displayName: title || `Provenance manifest`,
        description: `C2PA manifest for ${contentType} image`,
      });

      arnsUndername = undernameResult.undername;
      arnsUrl = undernameResult.fullUrl;

      logger.debug({ arnsUndername, arnsUrl }, 'Created ArNS undername');
    } else {
      // Generate undername but don't register (ArNS not configured)
      const uuid = crypto.randomUUID().split('-')[0];
      arnsUndername = `th-${uuid}`;
      arnsUrl = `https://${arnsUndername}.local.arweave.net`;
      logger.warn('ArNS not configured, using local undername');
    }

    // Step 6: Create C2PA manifest (signed image with embedded manifest)
    const manifestResult = await createManifest({
      imageBuffer,
      contentType,
      thumbnail: thumbnail
        ? {
            buffer: thumbnail.buffer,
            contentType: thumbnail.contentType,
          }
        : undefined,
      originalHash,
      pHash: phashResult.hex,
      arnsUrl,
      title,
      creator,
      priorManifest,
    });

    const signedImageBuffer = manifestResult.manifestBuffer;

    logger.debug(
      {
        signedImageSize: signedImageBuffer.length,
        hasPriorManifest: manifestResult.hasPriorManifest,
      },
      'Created C2PA manifest'
    );

    // Step 7: Extract JUMBF sidecar from signed image (manifest only, no pixels)
    const jumbfSidecar = extractManifestJUMBF(signedImageBuffer);
    if (!jumbfSidecar) {
      return {
        success: false,
        error: 'Failed to extract JUMBF manifest from signed image',
      };
    }

    logger.debug(
      {
        jumbfSize: jumbfSidecar.length,
        signedImageSize: signedImageBuffer.length,
        sizeReduction: signedImageBuffer.length - jumbfSidecar.length,
      },
      'Extracted JUMBF sidecar for storage'
    );

    // Step 8: Upload JUMBF sidecar to Arweave (all modes)
    // This is the manifest-only data without image pixels
    const turbo = await getTurboClient();
    const ownerAddress = await getWalletAddress();

    const sidecarUploadResult = await turbo.uploadFile({
      fileStreamFactory: () => Readable.from(jumbfSidecar),
      fileSizeFactory: () => jumbfSidecar.length,
      dataItemOpts: {
        tags: [
          { name: 'Content-Type', value: 'application/c2pa' },
          { name: 'Manifest-Type', value: 'sidecar' },
          { name: 'pHash', value: phashResult.hex },
          { name: 'App-Name', value: 'Trusthash-Sidecar' },
          { name: 'App-Version', value: '1.0.0' },
          { name: 'Original-Content-Type', value: contentType },
          { name: 'ArNS-Undername', value: arnsUndername },
          { name: 'Storage-Mode', value: storageMode },
        ],
      },
      signal: AbortSignal.timeout(60_000), // 60 second timeout
    });

    const manifestTxId = sidecarUploadResult.id;
    logger.info(
      { manifestTxId, sidecarSize: jumbfSidecar.length },
      'JUMBF sidecar uploaded to Arweave'
    );

    // Step 9: For full mode, also upload the complete signed image
    let signedImageTxId: string | undefined;
    if (storageMode === 'full') {
      const signedImageUploadResult = await turbo.uploadFile({
        fileStreamFactory: () => Readable.from(signedImageBuffer),
        fileSizeFactory: () => signedImageBuffer.length,
        dataItemOpts: {
          tags: [
            { name: 'Content-Type', value: manifestResult.contentType },
            { name: 'Manifest-Type', value: 'embedded' },
            { name: 'Manifest-Sidecar-TxId', value: manifestTxId },
            { name: 'pHash', value: phashResult.hex },
            { name: 'App-Name', value: 'Trusthash-Sidecar' },
            { name: 'App-Version', value: '1.0.0' },
            { name: 'Original-Content-Type', value: contentType },
            { name: 'ArNS-Undername', value: arnsUndername },
            { name: 'Storage-Mode', value: storageMode },
          ],
        },
        signal: AbortSignal.timeout(60_000), // 60 second timeout
      });
      signedImageTxId = signedImageUploadResult.id;
      logger.info(
        { signedImageTxId, signedImageSize: signedImageBuffer.length },
        'Full signed image uploaded to Arweave (full mode)'
      );
    }

    // Step 10: Upload thumbnail (for standard/full modes)
    let thumbnailTxId: string | undefined;
    if (thumbnail && storageMode !== 'minimal') {
      const thumbnailUploadResult = await turbo.uploadFile({
        fileStreamFactory: () => Readable.from(thumbnail.buffer),
        fileSizeFactory: () => thumbnail.buffer.length,
        dataItemOpts: {
          tags: [
            { name: 'Content-Type', value: thumbnail.contentType },
            { name: 'App-Name', value: 'Trusthash-Sidecar' },
            { name: 'App-Version', value: '1.0.0' },
            { name: 'Type', value: 'thumbnail' },
            { name: 'Parent-Manifest', value: manifestTxId },
          ],
        },
        signal: AbortSignal.timeout(30_000), // 30 second timeout
      });
      thumbnailTxId = thumbnailUploadResult.id;
      logger.info({ thumbnailTxId }, 'Thumbnail uploaded to Arweave');
    }

    // Step 11: Update ArNS undername to point to manifest (sidecar)
    if (isArnsConfigured()) {
      const updateResult = await updateUndername(arnsUndername, manifestTxId);
      if (updateResult.success) {
        logger.debug({ arnsUndername, manifestTxId }, 'ArNS undername updated to point to sidecar');
      } else {
        logger.warn({ error: updateResult.error }, 'Failed to update ArNS undername');
      }
    }

    // Step 12: Index in local database
    await insertManifest({
      manifestTxId,
      arnsUndername,
      arnsFullUrl: arnsUrl,
      originalHash,
      contentType,
      phash: phashResult.floats,
      hasPriorManifest: manifestResult.hasPriorManifest,
      claimGenerator: manifestResult.claimGenerator,
      ownerAddress,
    });

    logger.info(
      {
        manifestTxId,
        signedImageTxId,
        thumbnailTxId,
        arnsUrl,
        phash: phashResult.hex,
        storageMode,
        jumbfSize: jumbfSidecar.length,
        signedImageSize: signedImageBuffer.length,
      },
      'Image upload complete'
    );

    // Convert signed image to base64 for response (always returned to client)
    const signedImageBase64 = signedImageBuffer.toString('base64');

    return {
      success: true,
      data: {
        manifestTxId,
        signedImageTxId,
        arnsUndername,
        arnsUrl,
        phash: phashResult.hex,
        originalHash,
        hasPriorManifest: manifestResult.hasPriorManifest,
        contentType,
        storageMode,
        signedImage: signedImageBase64,
        thumbnailTxId,
      },
    };
  } catch (error) {
    logger.error({ error }, 'Image upload failed');
    return {
      success: false,
      error: `Upload failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Get the Turbo balance for the configured wallet.
 */
export async function getTurboBalance(): Promise<{ winc: string; credits: number }> {
  try {
    const turbo = await getTurboClient();
    const balance = await turbo.getBalance();

    return {
      winc: balance.winc.toString(),
      credits: Number(balance.winc) / 1e12, // Convert winston to AR
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get Turbo balance');
    throw error;
  }
}

/**
 * Estimate upload cost for a given file size.
 */
export async function estimateUploadCost(
  bytes: number
): Promise<{ winc: string; credits: number }> {
  try {
    const turbo = await getTurboClient();
    // getUploadCosts returns an array directly, not { costs: [...] }
    const [cost] = await turbo.getUploadCosts({ bytes: [bytes] });

    return {
      winc: cost.winc.toString(),
      credits: Number(cost.winc) / 1e12,
    };
  } catch (error) {
    logger.error({ error, bytes }, 'Failed to estimate upload cost');
    throw error;
  }
}
