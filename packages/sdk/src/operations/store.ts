import { createHash, randomUUID } from 'node:crypto';
import type { ResolvedConfig } from '../config.js';
import type { StoreOptions, StoreResult } from '../types.js';
import { GatewayClient } from '../clients/gateway.js';
import { SigningOracleClient } from '../clients/signing-oracle.js';
import { detectContentType } from '../c2pa/detect.js';
import { buildTags } from '../c2pa/tags.js';
import { uploadToArweave } from '../c2pa/upload.js';

function sha256Base64Url(data: Buffer | Uint8Array): string {
  const hash = createHash('sha256').update(data).digest();
  return hash.toString('base64url');
}

export async function executeStore(
  config: ResolvedConfig,
  _gateway: GatewayClient,
  signingOracle: SigningOracleClient | null,
  options: StoreOptions
): Promise<StoreResult> {
  if (!config.turboWallet) {
    throw new Error('ArIO.store(): turboWallet is required in config');
  }

  const data = Buffer.isBuffer(options.data) ? options.data : Buffer.from(options.data);
  const mode = options.mode ?? 'sign';
  const manifestRepoUrl = options.manifestRepoUrl ?? config.signingOracleUrl;

  // Detect content type
  const contentType = detectContentType(data);
  if (!contentType) {
    throw new Error('ArIO.store(): unsupported file format (cannot detect content type)');
  }

  // Compute asset hash
  const assetHash = sha256Base64Url(data);

  // Generate manifest ID
  const manifestId = `urn:c2pa:${randomUUID()}`;

  let uploadData = data;
  let manifestStoreHash = assetHash;

  if (mode === 'sign' && signingOracle) {
    // Sign mode: try to use c2pa-node for manifest creation
    try {
      const { signAndPrepare } = await import('@ar-io/turbo-c2pa');
      const result = await signAndPrepare({
        imageBuffer: data,
        remoteSigner: signingOracle as never,
        manifestRepoUrl: manifestRepoUrl ?? '',
        claimGenerator: options.claimGenerator ?? '@ar-io/sdk/0.1.0',
        digitalSourceType: options.sourceType,
      });
      uploadData = result.signedBuffer;
      manifestStoreHash = result.manifestStoreHash;

      // Build tags from the full signing result
      const tags = buildTags({
        contentType,
        manifestId: result.manifestId,
        storageMode: 'full',
        assetHash: result.assetHash,
        manifestStoreHash: result.manifestStoreHash,
        manifestRepoUrl: manifestRepoUrl ?? '',
        softBindingAlg: result.pHashHex ? 'org.ar-io.phash' : undefined,
        softBindingValue: result.pHashHex
          ? Buffer.from(result.pHashHex, 'hex').toString('base64')
          : undefined,
        claimGenerator: options.claimGenerator ?? '@ar-io/sdk/0.1.0',
      });

      // Add any custom metadata tags
      const allTags = [...tags];
      if (options.metadata) {
        for (const [name, value] of Object.entries(options.metadata)) {
          allTags.push({ name, value });
        }
      }

      const uploadResult = await uploadToArweave({
        data: uploadData,
        tags: allTags,
        ethPrivateKey: config.turboWallet,
        gatewayUrl: config.gatewayUrl,
      });

      return {
        txId: uploadResult.txId,
        manifestId: result.manifestId,
        assetHash: result.assetHash,
        viewUrl: uploadResult.viewUrl,
      };
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('Cannot find module') || err.message.includes('MODULE_NOT_FOUND'))
      ) {
        // turbo-c2pa not available — fall through to raw upload
      } else {
        throw err;
      }
    }
  }

  // Raw upload path (no C2PA signing or turbo-c2pa not available)
  if (!manifestRepoUrl) {
    throw new Error(
      'ArIO.store(): signingOracleUrl is required for store operations (used as manifestRepoUrl)'
    );
  }

  const tags = buildTags({
    contentType,
    manifestId,
    storageMode: 'full',
    assetHash,
    manifestStoreHash,
    manifestRepoUrl,
    claimGenerator: options.claimGenerator ?? '@ar-io/sdk/0.1.0',
  });

  // Add custom metadata tags
  if (options.metadata) {
    for (const [name, value] of Object.entries(options.metadata)) {
      tags.push({ name, value });
    }
  }

  const uploadResult = await uploadToArweave({
    data: uploadData,
    tags,
    ethPrivateKey: config.turboWallet,
    gatewayUrl: config.gatewayUrl,
  });

  return {
    txId: uploadResult.txId,
    manifestId,
    assetHash,
    viewUrl: uploadResult.viewUrl,
  };
}
