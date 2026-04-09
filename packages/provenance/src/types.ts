/** Configuration for the ContentProvenance service. */
export interface ProvenanceConfig {
  /** AR.IO gateway base URL. */
  gatewayUrl: string;
  /** Trusthash sidecar base URL (required for C2PA signing and manifest resolution). */
  trusthashUrl: string;
  /** Ethereum private key for Arweave uploads (hex string). */
  turboWallet?: string;
  /** Request timeout in milliseconds (default: 15000). */
  timeoutMs?: number;
}

/** IPTC digital source type for AI-generated content. */
export type DigitalSourceType =
  | 'trainedAlgorithmicMedia'
  | 'compositeWithTrainedAlgorithmicMedia'
  | 'algorithmicMedia'
  | 'digitalCapture'
  | 'digitalArt'
  | 'composite'
  | 'minorHumanEdits'
  | 'dataDrivenMedia';

/** Options for signing content with C2PA + anchoring on Arweave. */
export interface SignAndAnchorOptions {
  /** Content data (image, document, etc.). */
  data: Buffer | Uint8Array;
  /** Content type (auto-detected if omitted). */
  contentType?: string;
  /** IPTC digital source type describing how the content was created. */
  sourceType?: DigitalSourceType | string;
  /** Claim generator identifier (default: '@agenticway/provenance/0.1.0'). */
  claimGenerator?: string;
  /** Additional metadata tags for the anchor transaction. */
  metadata?: Record<string, string>;
}

/** Result of a signAndAnchor() operation. */
export interface SignAndAnchorResult {
  /** Arweave transaction ID for the C2PA-signed content. */
  contentTxId: string;
  /** URL to view the stored content. */
  viewUrl: string;
  /** C2PA manifest ID (urn:c2pa:...). */
  manifestId: string;
  /** base64url SHA-256 hash of the original asset. */
  assetHash: string;
  /** Arweave transaction ID for the Layer 1 integrity anchor. */
  anchorTxId: string;
  /** SHA-256 hash of the manifest data anchored on-chain (hex). */
  anchorHash: string;
  /** ISO timestamp of anchor creation. */
  timestamp: string;
}

/** Options for verifying content provenance. */
export interface VerifyProvenanceOptions {
  /** Arweave transaction ID of the C2PA-signed content. */
  contentTxId: string;
  /** Arweave transaction ID of the Layer 1 anchor (if known). */
  anchorTxId?: string;
}

/** C2PA verification result. */
export interface C2PAVerification {
  /** Whether C2PA tags are present and valid. */
  valid: boolean;
  /** C2PA manifest ID found on-chain. */
  manifestId: string | null;
  /** Storage mode (full, manifest, proof). */
  storageMode: string | null;
  /** Asset hash from C2PA tags. */
  assetHash: string | null;
  /** Content type from C2PA tags. */
  contentType: string | null;
  /** Soft binding algorithm (e.g. org.ar-io.phash). */
  softBindingAlg: string | null;
  /** Soft binding value. */
  softBindingValue: string | null;
}

/** Arweave anchor verification result. */
export interface AnchorVerification {
  /** Whether the anchor was found and validated. */
  valid: boolean;
  /** Anchor transaction ID. */
  txId: string | null;
  /** Hash stored on-chain. */
  anchoredHash: string | null;
  /** Block height of anchor transaction. */
  blockHeight: number | null;
  /** Block timestamp of anchor transaction. */
  timestamp: string | null;
}

/** Combined provenance verification result. */
export interface VerifyProvenanceResult {
  /** Overall provenance validity (both C2PA and anchor must pass when anchor is present). */
  valid: boolean;
  /** On-chain existence status of the content transaction. */
  existence: {
    status: 'confirmed' | 'pending' | 'not_found';
    blockHeight: number | null;
    blockTimestamp: string | null;
    confirmations: number | null;
  };
  /** C2PA content credentials verification. */
  c2pa: C2PAVerification;
  /** Layer 1 integrity anchor verification (null if no anchor found). */
  anchor: AnchorVerification | null;
  /** Transaction metadata. */
  metadata: {
    dataSize: number | null;
    contentType: string | null;
    owner: string | null;
  };
}

/** Options for querying provenance records. */
export interface QueryProvenanceOptions {
  /** Filter by manifest ID. */
  manifestId?: string;
  /** Filter by content type. */
  contentType?: string;
  /** Filter by signer/owner address. */
  owner?: string;
  /** Maximum results (default: 25, max: 100). */
  first?: number;
  /** Pagination cursor. */
  after?: string;
  /** Sort order (default: HEIGHT_DESC). */
  sort?: 'HEIGHT_DESC' | 'HEIGHT_ASC';
}

/** A single provenance record from a query. */
export interface ProvenanceRecord {
  /** Arweave transaction ID. */
  txId: string;
  /** Owner wallet address. */
  owner: string;
  /** C2PA manifest ID. */
  manifestId: string | null;
  /** Content type. */
  contentType: string | null;
  /** Storage mode. */
  storageMode: string | null;
  /** Asset hash. */
  assetHash: string | null;
  /** Block info (null if pending). */
  block: { height: number; timestamp: number } | null;
  /** Data size in bytes. */
  dataSize: number;
}

/** Result of a queryProvenance() operation. */
export interface QueryProvenanceResult {
  /** Matching provenance records. */
  records: ProvenanceRecord[];
  /** Pagination info. */
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}
