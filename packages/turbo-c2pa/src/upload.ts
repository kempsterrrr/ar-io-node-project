/**
 * Upload signed C2PA images to Arweave via Turbo SDK.
 */

import { TurboFactory } from '@ardrive/turbo-sdk';
import { Readable } from 'node:stream';
import type { Tag } from '@ar-io/c2pa-protocol';

export interface UploadOptions {
  /** Signed image buffer (with embedded C2PA manifest). */
  signedBuffer: Buffer;
  /** ANS-104 tags from buildTags(). */
  tags: Tag[];
  /** Ethereum private key (hex string, with or without 0x prefix). */
  ethPrivateKey: string;
  /** Gateway base URL for constructing view URLs (default: https://arweave.net). */
  gatewayUrl?: string;
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
 * Upload a signed image to Arweave via Turbo SDK using an Ethereum wallet.
 */
export async function uploadToArweave(options: UploadOptions): Promise<UploadResult> {
  const { signedBuffer, tags, ethPrivateKey, gatewayUrl = 'https://turbo-gateway.com' } = options;

  // Normalize private key (ensure 0x prefix for Turbo SDK)
  const normalizedKey = ethPrivateKey.startsWith('0x') ? ethPrivateKey : `0x${ethPrivateKey}`;

  const turbo = TurboFactory.authenticated({
    privateKey: normalizedKey,
    token: 'ethereum',
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
