import { createData, EthereumSigner, keccak256 } from '@dha-team/arbundles';
import type { Tag } from '@ar-io/c2pa-protocol';
import type { DataItemHeader } from '../types.js';

export interface SignedDataItemResult {
  rawBytes: Buffer;
  header: DataItemHeader;
}

function deriveOwnerAddress(ownerB64url: string): string {
  const pubKeyBytes = Buffer.from(ownerB64url, 'base64url');
  const hash = keccak256(pubKeyBytes.slice(1));
  return Buffer.from(hash.slice(-20)).toString('base64url');
}

export async function createSignedDataItem(
  data: Buffer,
  tags: Tag[],
  ethPrivateKey: string
): Promise<SignedDataItemResult> {
  const normalizedKey = ethPrivateKey.startsWith('0x') ? ethPrivateKey : `0x${ethPrivateKey}`;
  const signer = new EthereumSigner(normalizedKey);

  const dataItem = createData(data, signer, {
    tags: tags.map((t) => ({ name: t.name, value: t.value })),
  });
  await dataItem.sign(signer);

  const header: DataItemHeader = {
    id: dataItem.id,
    owner: dataItem.owner,
    owner_address: deriveOwnerAddress(dataItem.owner),
    signature: dataItem.signature,
    data_size: dataItem.rawData.length,
    tags: dataItem.tags,
  };

  return { rawBytes: dataItem.getRaw(), header };
}
