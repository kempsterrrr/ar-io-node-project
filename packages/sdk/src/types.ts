import type { Tag } from '@ar-io/c2pa-protocol';

/** Configuration for the ArIO SDK. */
export interface ArIOConfig {
  /** Gateway base URL (e.g. 'https://ario.agenticway.io' or 'http://localhost:3000'). */
  gatewayUrl: string;
  /** Trusthash signing oracle base URL (e.g. 'https://ario.agenticway.io/trusthash/v1'). */
  signingOracleUrl?: string;
  /** Ethereum private key for Turbo uploads (hex string). */
  turboWallet?: string;
  /** Request timeout in milliseconds (default: 15000). */
  timeoutMs?: number;
}

/** Options for the store() operation. */
export interface StoreOptions {
  /** Data to store (image or arbitrary bytes). */
  data: Buffer | Uint8Array;
  /** IPTC digital source type (e.g. 'digitalCapture'). Required for sign mode. */
  sourceType?: string;
  /** Storage mode: 'sign' creates new C2PA manifest, 'preserve' keeps existing. Default: 'sign'. */
  mode?: 'sign' | 'preserve';
  /** Optional metadata tags to include on the Arweave transaction. */
  metadata?: Record<string, string>;
  /** Claim generator name/version. */
  claimGenerator?: string;
  /** Override the manifest repository URL (defaults to signingOracleUrl). */
  manifestRepoUrl?: string;
}

/** Result of a store() operation. */
export interface StoreResult {
  /** Arweave transaction ID. */
  txId: string;
  /** C2PA manifest ID (urn:c2pa:...). */
  manifestId: string;
  /** base64url SHA-256 hash of the original asset. */
  assetHash: string;
  /** URL to view the stored data. */
  viewUrl: string;
}

/** Options for the retrieve() operation. */
export interface RetrieveOptions {
  /** Arweave transaction ID or ArNS name. */
  id: string;
}

/** Result of a retrieve() operation. */
export interface RetrieveResult {
  /** Raw data bytes. */
  data: Buffer;
  /** Content-Type of the data. */
  contentType: string;
  /** Arweave transaction tags. */
  tags: Tag[];
}

/** Options for the verify() operation. */
export interface VerifyOptions {
  /** Arweave transaction ID. */
  txId: string;
}

/** Result of a verify() operation. */
export interface VerifyResult {
  /** Verification ID. */
  verificationId: string;
  /** Whether the verification passed. */
  valid: boolean;
  /** Verification tier ('full' or 'basic'). */
  tier: 'full' | 'basic';
  /** On-chain existence status. */
  existence: {
    status: 'confirmed' | 'pending' | 'not_found';
    blockHeight: number | null;
    blockTimestamp: string | null;
    confirmations: number | null;
  };
  /** Data integrity check. */
  integrity: {
    status: 'verified' | 'unavailable';
    hash: string | null;
    match: boolean | null;
  };
  /** Transaction metadata. */
  metadata: {
    dataSize: number | null;
    contentType: string | null;
    tags: Tag[];
  };
  /** Links to dashboard and PDF attestation. */
  links: {
    dashboard: string | null;
    pdf: string | null;
  };
}

/** Options for the search() operation. */
export interface SearchOptions {
  /** Image buffer to find similar content for. */
  image?: Buffer | Uint8Array;
  /** Pre-computed perceptual hash (16-char hex). */
  phash?: string;
  /** Hamming distance threshold (0-64, default: 10). */
  threshold?: number;
  /** Maximum results to return (default: 10). */
  limit?: number;
}

/** A single search match. */
export interface SearchMatch {
  /** Arweave transaction ID of the matching manifest. */
  manifestTxId: string;
  /** C2PA manifest ID. */
  manifestId: string;
  /** Hamming distance from the query. */
  distance: number;
  /** Content type of the match. */
  contentType: string;
}

/** Result of a search() operation. */
export interface SearchResult {
  /** Matching results sorted by distance. */
  results: SearchMatch[];
  /** Total number of matches found. */
  total: number;
}

/** Gateway info response. */
export interface GatewayInfo {
  processId: string;
  release: string;
  [key: string]: unknown;
}
