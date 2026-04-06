import type { Tag } from '@ar-io/c2pa-protocol';

/** A gateway target for optimistic indexing fan-out. */
export interface GatewayTarget {
  /** Gateway base URL (e.g. 'https://gw2.example.com'). */
  url: string;
  /** ADMIN_API_KEY for this gateway's admin API. */
  adminApiKey: string;
}

/** Per-gateway fan-out result. */
export interface FanOutResult {
  /** Gateway URL that was targeted. */
  gateway: string;
  /** Whether the fan-out succeeded. */
  status: 'success' | 'error';
  /** Error message if status is 'error'. */
  message?: string;
}

/** Options for controlling fan-out behavior. */
export interface FanOutOptions {
  /** Timeout per gateway in milliseconds (default: 10000). */
  timeoutMs?: number;
  /** Number of retries per gateway on failure (default: 1). */
  retries?: number;
  /** Base delay between retries in milliseconds, doubled each attempt (default: 1000). */
  retryDelayMs?: number;
}

/** Data item header fields sent to the gateway admin API. */
export interface DataItemHeader {
  id: string;
  owner: string;
  owner_address: string;
  signature: string;
  data_size: number;
  tags?: { name: string; value: string }[];
  target?: string;
  anchor?: string;
}

/** Configuration for the AgenticWay SDK. */
export interface AgenticWayConfig {
  /** Gateway base URL (e.g. 'https://ario.agenticway.io' or 'http://localhost:3000'). */
  gatewayUrl: string;
  /** Trusthash sidecar base URL (for C2PA provenance features). */
  trusthashUrl?: string;
  /** Ethereum private key for Turbo uploads (hex string). */
  turboWallet?: string;
  /** Request timeout in milliseconds (default: 15000). */
  timeoutMs?: number;
  /** Gateways to receive data item headers after upload for optimistic indexing. */
  optimisticIndexTargets?: GatewayTarget[];
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
  /** Per-gateway fan-out results (only present when optimisticIndexTargets configured). */
  fanOutResults?: FanOutResult[];
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

/** Options for the anchor() operation. */
export interface AnchorOptions {
  /** Data to anchor (any bytes). */
  data: Buffer | Uint8Array;
  /** Optional metadata tags stored alongside the integrity proof. */
  metadata?: Record<string, string>;
}

/** Result of an anchor() operation. */
export interface AnchorResult {
  /** Arweave transaction ID of the integrity proof. */
  txId: string;
  /** SHA-256 hash of the data (hex). */
  hash: string;
  /** ISO timestamp when the anchor was created. */
  timestamp: string;
}

/** Options for the verifyAnchor() operation. */
export interface VerifyAnchorOptions {
  /** Data to verify against the anchor. */
  data: Buffer | Uint8Array;
  /** Arweave transaction ID of the integrity proof. */
  txId: string;
}

/** Result of a verifyAnchor() operation. */
export interface VerifyAnchorResult {
  /** Whether the data matches the anchored hash. */
  valid: boolean;
  /** SHA-256 hash of the provided data (hex). */
  hash: string;
  /** SHA-256 hash stored on-chain (hex), or null if not found. */
  anchoredHash: string | null;
  /** Block height of the anchor transaction, or null if pending. */
  blockHeight: number | null;
  /** ISO timestamp of the anchor block, or null if pending. */
  timestamp: string | null;
}

/** A single item in a batch anchor request. */
export interface BatchAnchorItem {
  /** Data to anchor. */
  data: Buffer | Uint8Array;
}

/** Proof for a single item in a batch anchor. */
export interface BatchAnchorProof {
  /** Index of the item in the original batch. */
  index: number;
  /** SHA-256 hash of the item data (hex). */
  hash: string;
  /** Merkle inclusion proof path. */
  proof: Array<{ hash: string; position: 'left' | 'right' }>;
}

/** Options for the batchAnchor() operation. */
export interface BatchAnchorOptions {
  /** Items to anchor as a batch. */
  items: BatchAnchorItem[];
  /** Optional metadata tags stored on the batch anchor transaction. */
  metadata?: Record<string, string>;
}

/** Result of a batchAnchor() operation. */
export interface BatchAnchorResult {
  /** Arweave transaction ID of the batch integrity proof. */
  txId: string;
  /** Merkle root hash (hex). */
  merkleRoot: string;
  /** Individual proofs for each item. */
  proofs: BatchAnchorProof[];
  /** ISO timestamp when the batch anchor was created. */
  timestamp: string;
}

/** Gateway info response. */
export interface GatewayInfo {
  processId: string;
  release: string;
  [key: string]: unknown;
}
