/**
 * Upload data to Arweave via Turbo SDK.
 * Extracted from @ar-io/turbo-c2pa.
 */

import { TurboFactory } from '@ardrive/turbo-sdk';
import { Readable } from 'node:stream';
import type { Tag } from '@ar-io/c2pa-protocol';

export interface UploadOptions {
  /** Data buffer to upload. */
  data: Buffer;
  /** ANS-104 tags. */
  tags: Tag[];
  /** Ethereum private key (hex string, with or without 0x prefix). */
  ethPrivateKey: string;
  /** Gateway base URL for constructing view URLs. */
  gatewayUrl?: string;
}

export interface UploadResult {
  txId: string;
  viewUrl: string;
  owner: string;
  dataCaches: string[];
}

/** Upload data to Arweave via Turbo SDK using an Ethereum wallet. */
export async function uploadToArweave(options: UploadOptions): Promise<UploadResult> {
  const { data, tags, ethPrivateKey, gatewayUrl = 'https://arweave.net' } = options;

  const normalizedKey = ethPrivateKey.startsWith('0x') ? ethPrivateKey : `0x${ethPrivateKey}`;

  const turbo = TurboFactory.authenticated({
    privateKey: normalizedKey,
    token: 'ethereum',
  });

  const result = await turbo.uploadFile({
    fileStreamFactory: () => Readable.from(data),
    fileSizeFactory: () => data.length,
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
