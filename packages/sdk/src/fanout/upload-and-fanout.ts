import { TurboFactory } from '@ardrive/turbo-sdk';
import { Readable } from 'node:stream';
import type { Tag } from '@ar-io/c2pa-protocol';
import type { GatewayTarget, FanOutResult, FanOutOptions } from '../types.js';
import { createSignedDataItem } from './data-item.js';
import { fanOutDataItem } from './fanout.js';

export interface UploadAndFanOutOptions {
  data: Buffer;
  tags: Tag[];
  ethPrivateKey: string;
  gateways: GatewayTarget[];
  gatewayUrl?: string;
  fanOutOptions?: FanOutOptions;
}

export interface UploadAndFanOutResult {
  txId: string;
  viewUrl: string;
  owner: string;
  dataCaches: string[];
  fanOutResults: FanOutResult[];
}

export async function uploadAndFanOut(
  options: UploadAndFanOutOptions
): Promise<UploadAndFanOutResult> {
  const { data, tags, ethPrivateKey, gateways, gatewayUrl = 'https://arweave.net' } = options;

  const { rawBytes, header } = await createSignedDataItem(data, tags, ethPrivateKey);

  const normalizedKey = ethPrivateKey.startsWith('0x') ? ethPrivateKey : `0x${ethPrivateKey}`;
  const turbo = TurboFactory.authenticated({
    privateKey: normalizedKey,
    token: 'ethereum',
  });

  const uploadResult = await turbo.uploadSignedDataItem({
    dataItemStreamFactory: () => Readable.from(rawBytes),
    dataItemSizeFactory: () => rawBytes.length,
  });

  const fanOutResults = await fanOutDataItem(header, gateways, options.fanOutOptions);

  return {
    txId: uploadResult.id,
    viewUrl: `${gatewayUrl.replace(/\/$/, '')}/${uploadResult.id}`,
    owner: uploadResult.owner,
    dataCaches: uploadResult.dataCaches || [],
    fanOutResults,
  };
}
