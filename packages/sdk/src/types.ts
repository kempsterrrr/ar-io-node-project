import type { Tag } from '@ar-io/c2pa-protocol';

/** Configuration for the ArIO SDK. */
export interface ArIOConfig {
  /** Gateway base URL (e.g. 'https://ario.agenticway.io' or 'http://localhost:3000'). */
  gatewayUrl: string;
  /** Trusthash sidecar base URL (for C2PA provenance features). */
  trusthashUrl?: string;
  /** Ethereum private key for Turbo uploads (hex string). */
  turboWallet?: string;
  /** Request timeout in milliseconds (default: 15000). */
  timeoutMs?: number;
}

/** Options for the store() operation. */
export interface StoreOptions {
  /** Data to store (any bytes — text, JSON, image, etc.). */
  data: Buffer | Uint8Array;
  /** Content type of the data (e.g. 'text/plain', 'application/json', 'image/jpeg'). Auto-detected from magic bytes if omitted. */
  contentType?: string;
  /** Custom tags to include on the Arweave transaction. */
  tags?: Record<string, string>;
  /** C2PA provenance options. When provided, store() signs a C2PA manifest. Requires trusthashUrl. */
  provenance?: {
    /** IPTC digital source type (e.g. 'compositeWithTrainedAlgorithmicMedia'). */
    sourceType?: string;
    /** Claim generator name/version. */
    claimGenerator?: string;
  };
}

/** Result of a store() operation. */
export interface StoreResult {
  /** Arweave transaction ID. */
  txId: string;
  /** URL to view the stored data. */
  viewUrl: string;
  /** C2PA provenance details (only present when provenance option was used). */
  provenance?: {
    /** C2PA manifest ID (urn:c2pa:...). */
    manifestId: string;
    /** base64url SHA-256 hash of the original asset. */
    assetHash: string;
  };
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

/** Tag filter for query() operations. */
export interface TagFilter {
  /** Tag name to match. */
  name: string;
  /** Tag values to match (any of). */
  values: string[];
}

/** Options for the query() operation. */
export interface QueryOptions {
  /** Filter by transaction tags. */
  tags?: TagFilter[];
  /** Filter by owner wallet addresses. */
  owners?: string[];
  /** Maximum results to return (default: 25, max: 100). */
  first?: number;
  /** Cursor for pagination (from pageInfo.endCursor). */
  after?: string;
  /** Sort order (default: 'HEIGHT_DESC'). */
  sort?: 'HEIGHT_DESC' | 'HEIGHT_ASC';
  /** Filter by minimum block height. */
  minBlock?: number;
  /** Filter by maximum block height. */
  maxBlock?: number;
}

/** A single query result edge. */
export interface QueryEdge {
  /** Arweave transaction ID. */
  txId: string;
  /** Owner wallet address. */
  owner: string;
  /** Transaction tags. */
  tags: Tag[];
  /** Block info (null if pending). */
  block: { height: number; timestamp: number } | null;
  /** Data size in bytes. */
  dataSize: number;
}

/** Pagination info for query results. */
export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

/** Result of a query() operation. */
export interface QueryResult {
  /** Matching transaction edges. */
  edges: QueryEdge[];
  /** Pagination info. */
  pageInfo: PageInfo;
}

/** Result of a resolve() operation. */
export interface ResolveResult {
  /** Resolved Arweave transaction ID. */
  txId: string;
  /** TTL in seconds (if available). */
  ttl: number | null;
  /** Owner of the ArNS name. */
  owner: string | null;
}

/** Options for the search() operation (requires trusthashUrl). */
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
