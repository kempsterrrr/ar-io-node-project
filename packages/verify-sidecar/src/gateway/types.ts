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

/** Parsed headers from HEAD /raw/{txId} */
export interface RawDataHeaders {
  digest: string | null;
  rootTransactionId: string | null;
  contentType: string | null;
  contentLength: number | null;
}
