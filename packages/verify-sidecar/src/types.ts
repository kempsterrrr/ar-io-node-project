export interface VerificationResult {
  verificationId: string;
  timestamp: string;
  txId: string;
  tier: 'full' | 'basic';

  existence: {
    status: 'confirmed' | 'pending' | 'not_found';
    blockHeight: number | null;
    blockTimestamp: string | null;
    blockId: string | null;
    confirmations: number | null;
  };

  owner: {
    address: string | null;
    publicKey: string | null;
    signatureValid: boolean | null;
  };

  integrity: {
    status: 'verified' | 'unavailable';
    hash: string | null;
    onChainDigest: string | null;
    match: boolean | null;
    deepVerification: boolean;
  };

  metadata: {
    dataSize: number | null;
    contentType: string | null;
    tags: Array<{ name: string; value: string }>;
  };

  bundle: {
    isBundled: boolean;
    rootTransactionId: string | null;
  };

  fileComparisons: Array<{
    filename: string;
    fileHash: string;
    onChainHash: string;
    match: boolean;
  }>;

  receipt: {
    provided: boolean;
    signatureValid: boolean | null;
    receiptTimestamp: string | null;
    receiptOwner: string | null;
    ownerMatchesOnChain: boolean | null;
    receiptIdMatchesTxId: boolean | null;
    timestampPredatesBlock: boolean | null;
    turboStatus: string | null;
  };

  multiGateway: {
    enabled: boolean;
    totalQueried: number;
    totalResponded: number;
    totalAgreed: number;
    consensusMet: boolean;
    gateways: Array<{
      host: string;
      hash: string | null;
      agrees: boolean | null;
      operatorStake: number;
      responseTimeMs: number;
    }>;
  };

  links: {
    dashboard: string | null;
    pdf: string | null;
    rawData: string | null;
  };
}

export interface VerifyRequest {
  txId: string;
  deepVerification?: boolean;
  multiGateway?: boolean;
}
