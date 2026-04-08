/**
 * Upload C2PA data items to Arweave via Turbo SDK.
 *
 * Supports all three storage modes:
 * - full: signed image with embedded manifest
 * - manifest: raw JUMBF manifest bytes
 * - proof: JSON proof-locator record
 */

import { TurboFactory } from '@ardrive/turbo-sdk';
import { Readable } from 'node:stream';
import type { Tag } from '@ar-io/c2pa-protocol';

export interface UploadOptions {
  /** Data buffer to upload (signed image, manifest bytes, or proof payload). */
  dataBuffer?: Buffer;
  /** @deprecated Use dataBuffer instead. Alias kept for backward compatibility. */
  signedBuffer?: Buffer;
  /** ANS-104 tags from buildTags(). */
  tags: Tag[];
  /** Ethereum private key (hex string, with or without 0x prefix). */
  ethPrivateKey: string;
  /** Gateway base URL for constructing view URLs (default: https://arweave.net). */
  gatewayUrl?: string;
  /**
   * Custom upload service URL (e.g. https://ario.agenticway.io/bundler).
   * When set, data items are sent to this endpoint instead of the
   * default Turbo upload service, enabling optimistic caching and
   * immediate gateway availability before L1 confirmation.
   */
  uploadServiceUrl?: string;
}

export interface UploadResult {
  /** Arweave transaction ID. */
  txId: string;
  /** URL to view the uploaded image on the gateway. */
  viewUrl: string;
  /** Owner address of the upload. */
  owner: string;
  /** Bytes uploaded. */
  dataCaches: string[];
}

/**
 * Upload a C2PA data item to Arweave via Turbo SDK using an Ethereum wallet.
 */
export async function uploadToArweave(options: UploadOptions): Promise<UploadResult> {
  const {
    tags,
    ethPrivateKey,
    gatewayUrl = 'https://turbo-gateway.com',
    uploadServiceUrl,
  } = options;

  const signedBuffer = options.dataBuffer ?? options.signedBuffer;
  if (!signedBuffer) {
    throw new Error('Either dataBuffer or signedBuffer must be provided');
  }

  // Normalize private key (ensure 0x prefix for Turbo SDK)
  const normalizedKey = ethPrivateKey.startsWith('0x') ? ethPrivateKey : `0x${ethPrivateKey}`;

  const turbo = TurboFactory.authenticated({
    privateKey: normalizedKey,
    token: 'ethereum',
    ...(uploadServiceUrl ? { uploadServiceConfig: { url: uploadServiceUrl } } : {}),
  });

  const result = await turbo.uploadFile({
    fileStreamFactory: () => Readable.from(signedBuffer),
    fileSizeFactory: () => signedBuffer.length,
    dataItemOpts: {
      tags: tags.map((t) => ({ name: t.name, value: t.value })),
    },
  });

  const txId = result.id;
  const viewUrl = `${gatewayUrl.replace(/\/$/, '')}/${txId}`;

  return {
    txId,
    viewUrl,
    owner: result.owner,
    dataCaches: result.dataCaches || [],
  };
}
