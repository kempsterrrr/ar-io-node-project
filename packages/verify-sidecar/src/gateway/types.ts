/** Response from GET /tx/{txId} */
export interface GatewayTransaction {
  format: number;
  id: string;
  last_tx: string;
  owner: string;
  tags: Array<{ name: string; value: string }>;
  target: string;
  quantity: string;
  data_root: string;
  data_size: string;
  reward: string;
  signature: string;
}

/** Response from GET /tx/{txId}/status */
export interface GatewayTransactionStatus {
  block_height: number;
  block_indep_hash: string;
  number_of_confirmations: number;
}

/** Response from GET /block/height/{height} */
export interface GatewayBlock {
  nonce: string;
  previous_block: string;
  timestamp: number;
  last_retarget: number;
  diff: string;
  height: number;
  hash: string;
  indep_hash: string;
  txs: string[];
  tx_root: string;
  wallet_list: string;
  reward_addr: string;
  reward_pool: string;
  weave_size: string;
  block_size: string;
}

/** Response fields added in newer gateway versions */
export interface GatewayTransactionExtended extends GatewayTransaction {
  signature_type?: number;
  parent_id?: string | null;
  root_transaction_id?: string | null;
  content_type?: string | null;
}

/** Parsed headers from HEAD /raw/{txId} */
export interface RawDataHeaders {
  digest: string | null;
  rootTransactionId: string | null;
  contentType: string | null;
  contentLength: number | null;

  // Arweave cryptographic headers
  signature: string | null;
  owner: string | null;
  ownerAddress: string | null;
  signatureType: number | null;
  anchor: string | null;

  // Tags parsed from x-arweave-tag-* headers (decoded name/value pairs)
  tags: Array<{ name: string; value: string }>;
  tagCount: number | null;

  // Data item offset info (for fetching the binary header from the root bundle)
  dataItemOffset: number | null;
  dataItemDataOffset: number | null;

  // Gateway trust assessment headers
  arIoVerified: boolean | null;
  arIoStable: boolean | null;
  arIoTrusted: boolean | null;
  arIoHops: number | null;
  arIoDataId: string | null;
}
