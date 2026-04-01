import { createHash } from 'node:crypto';
import type { ResolvedConfig } from '../config.js';
import type { StoreOptions, StoreResult } from '../types.js';
import { GatewayClient } from '../clients/gateway.js';
import { SigningOracleClient } from '../clients/signing-oracle.js';
import { detectContentType } from '../c2pa/detect.js';
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

  // Determine content type: explicit > auto-detect > default
  const contentType = options.contentType ?? detectContentType(data) ?? 'application/octet-stream';

  // Build Arweave tags
  const tags: Array<{ name: string; value: string }> = [
    { name: 'Content-Type', value: contentType },
  ];

  // Add custom tags
  if (options.tags) {
    for (const [name, value] of Object.entries(options.tags)) {
      tags.push({ name, value });
    }
  }

  // C2PA provenance (opt-in)
  if (options.provenance) {
    if (!config.trusthashUrl) {
      throw new Error('ArIO.store(): trusthashUrl is required for provenance signing');
    }
    if (!signingOracle) {
      throw new Error('ArIO.store(): trusthashUrl is required for provenance signing');
    }

    try {
      const { signAndPrepare } = await import('@ar-io/turbo-c2pa');
      const { buildTags } = await import('../c2pa/tags.js');

      const result = await signAndPrepare({
        imageBuffer: data,
        remoteSigner: signingOracle as never,
        manifestRepoUrl: config.trusthashUrl,
        claimGenerator: options.provenance.claimGenerator ?? '@agenticway/sdk/0.2.0',
        digitalSourceType: options.provenance.sourceType,
      });

      const provTags = buildTags({
        contentType,
        manifestId: result.manifestId,
        storageMode: 'full',
        assetHash: result.assetHash,
        manifestStoreHash: result.manifestStoreHash,
        manifestRepoUrl: config.trusthashUrl,
        softBindingAlg: result.pHashHex ? 'org.ar-io.phash' : undefined,
        softBindingValue: result.pHashHex
          ? Buffer.from(result.pHashHex, 'hex').toString('base64')
          : undefined,
        claimGenerator: options.provenance.claimGenerator ?? '@agenticway/sdk/0.2.0',
      });

      // Merge provenance tags with custom tags (provenance first, then custom overrides)
      const allTags = [...provTags];
      if (options.tags) {
        for (const [name, value] of Object.entries(options.tags)) {
          allTags.push({ name, value });
        }
      }

      const uploadResult = await uploadToArweave({
        data: result.signedBuffer,
        tags: allTags,
        ethPrivateKey: config.turboWallet,
        gatewayUrl: config.gatewayUrl,
      });

      return {
        txId: uploadResult.txId,
        viewUrl: uploadResult.viewUrl,
        provenance: {
          manifestId: result.manifestId,
          assetHash: result.assetHash,
        },
      };
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('Cannot find module') || err.message.includes('MODULE_NOT_FOUND'))
      ) {
        throw new Error(
          'ArIO.store(): provenance signing requires @ar-io/turbo-c2pa and its dependencies (npm install @contentauth/c2pa-node sharp blockhash-core)'
        );
      }
      throw err;
    }
  }

  // Plain data upload (no C2PA)
  const uploadResult = await uploadToArweave({
    data,
    tags,
    ethPrivateKey: config.turboWallet,
    gatewayUrl: config.gatewayUrl,
  });

  return {
    txId: uploadResult.txId,
    viewUrl: uploadResult.viewUrl,
  };
}
