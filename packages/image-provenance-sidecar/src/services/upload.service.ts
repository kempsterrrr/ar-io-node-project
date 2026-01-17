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
import { createManifest, readManifest } from './c2pa.service.js';
import {
  createUndername,
  updateUndername,
  buildArnsUrl,
  getWalletAddress,
  isArnsConfigured,
} from './arns.service.js';
import { insertManifest } from '../db/index.js';
import type { C2PAIngredient } from '../types/c2pa.js';

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
}

/**
 * Upload result
 */
export interface UploadResult {
  /** Success indicator */
  success: boolean;
  /** Data payload (on success) */
  data?: {
    /** Arweave transaction ID of the manifest */
    manifestTxId: string;
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
  const { imageBuffer, contentType, title, creator } = options;

  logger.info(
    {
      contentType,
      size: imageBuffer.length,
      hasTitle: !!title,
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

    // Step 4: Generate thumbnail
    const thumbnail = await generateThumbnail(imageBuffer);
    logger.debug({ thumbnailSize: thumbnail.size }, 'Generated thumbnail');

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
      arnsUndername = `prov-${uuid}`;
      arnsUrl = `https://${arnsUndername}.local.arweave.net`;
      logger.warn('ArNS not configured, using local undername');
    }

    // Step 6: Create C2PA manifest
    const manifestResult = await createManifest({
      imageBuffer,
      contentType,
      thumbnail: {
        buffer: thumbnail.buffer,
        contentType: thumbnail.contentType,
      },
      originalHash,
      pHash: phashResult.hex,
      arnsUrl,
      title,
      creator,
      priorManifest,
    });

    logger.debug(
      {
        manifestSize: manifestResult.manifestBuffer.length,
        hasPriorManifest: manifestResult.hasPriorManifest,
      },
      'Created C2PA manifest'
    );

    // Step 7: Upload manifest to Arweave via Turbo
    const turbo = await getTurboClient();
    const ownerAddress = await getWalletAddress();

    const uploadResult = await turbo.uploadFile({
      fileStreamFactory: () => Readable.from(manifestResult.manifestBuffer),
      fileSizeFactory: () => manifestResult.manifestBuffer.length,
      dataItemOpts: {
        tags: [
          { name: 'Content-Type', value: manifestResult.contentType },
          { name: 'pHash', value: phashResult.hex },
          { name: 'App-Name', value: 'Image-Provenance-Sidecar' },
          { name: 'App-Version', value: '0.1.0' },
          { name: 'Original-Content-Type', value: contentType },
          { name: 'ArNS-Undername', value: arnsUndername },
        ],
      },
      signal: AbortSignal.timeout(60_000), // 60 second timeout
    });

    const manifestTxId = uploadResult.id;
    logger.info({ manifestTxId }, 'Manifest uploaded to Arweave');

    // Step 8: Update ArNS undername to point to manifest
    if (isArnsConfigured()) {
      const updateResult = await updateUndername(arnsUndername, manifestTxId);
      if (updateResult.success) {
        logger.debug({ arnsUndername, manifestTxId }, 'ArNS undername updated');
      } else {
        logger.warn({ error: updateResult.error }, 'Failed to update ArNS undername');
      }
    }

    // Step 9: Index in local database
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
        arnsUrl,
        phash: phashResult.hex,
      },
      'Image upload complete'
    );

    return {
      success: true,
      data: {
        manifestTxId,
        arnsUndername,
        arnsUrl,
        phash: phashResult.hex,
        originalHash,
        hasPriorManifest: manifestResult.hasPriorManifest,
        contentType,
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
