import type { Aiuc1Domain, ControlId, EvidenceType } from './schema/domains.js';

/** Configuration for the EvidenceVault. */
export interface EvidenceVaultConfig {
  /** Gateway base URL (e.g. 'https://ario.agenticway.io'). */
  gatewayUrl: string;
  /** Ethereum private key for Turbo uploads (hex string). */
  turboWallet?: string;
  /** Enterprise storage adapter. */
  storage?: StorageAdapter;
  /** Request timeout in milliseconds (default: 15000). */
  timeoutMs?: number;
}

/** Options for anchoring a single piece of evidence. */
export interface AnchorEvidenceOptions {
  /** The evidence data (file contents). */
  data: Buffer | Uint8Array;
  /** AIUC-1 control ID this evidence supports (e.g. 'S001'). */
  controlId: ControlId;
  /** Type of evidence. */
  evidenceType: EvidenceType;
  /** Human-readable label for the evidence. */
  label?: string;
  /** Organization identifier. */
  organizationId?: string;
  /** Additional metadata. */
  metadata?: Record<string, string>;
}

/** Result of anchoring evidence. */
export interface AnchorEvidenceResult {
  /** Arweave transaction ID of the integrity proof. */
  txId: string;
  /** SHA-256 hash of the evidence data (hex). */
  hash: string;
  /** AIUC-1 control ID. */
  controlId: ControlId;
  /** AIUC-1 domain (derived from control). */
  domain: Aiuc1Domain;
  /** Evidence type. */
  evidenceType: EvidenceType;
  /** ISO timestamp when the anchor was created. */
  timestamp: string;
}

/** A single item in a batch evidence anchor request. */
export interface BatchEvidenceItem {
  /** The evidence data (file contents). */
  data: Buffer | Uint8Array;
  /** AIUC-1 control ID. */
  controlId: ControlId;
  /** Type of evidence. */
  evidenceType: EvidenceType;
  /** Human-readable label. */
  label?: string;
}

/** Options for batch anchoring evidence. */
export interface BatchAnchorEvidenceOptions {
  /** Evidence items to anchor as a batch. */
  items: BatchEvidenceItem[];
  /** Organization identifier. */
  organizationId?: string;
  /** Additional metadata applied to the entire batch. */
  metadata?: Record<string, string>;
}

/** Proof for a single item in a batch anchor. */
export interface BatchEvidenceProof {
  /** Index of the item in the original batch. */
  index: number;
  /** SHA-256 hash of the evidence data (hex). */
  hash: string;
  /** AIUC-1 control ID. */
  controlId: ControlId;
  /** Evidence type. */
  evidenceType: EvidenceType;
  /** Merkle inclusion proof path. */
  proof: Array<{ hash: string; position: 'left' | 'right' }>;
}

/** Result of batch anchoring evidence. */
export interface BatchAnchorEvidenceResult {
  /** Arweave transaction ID of the batch integrity proof. */
  txId: string;
  /** Merkle root hash (hex). */
  merkleRoot: string;
  /** Individual proofs for each item. */
  proofs: BatchEvidenceProof[];
  /** ISO timestamp. */
  timestamp: string;
}

/** Options for querying evidence proofs. */
export interface QueryEvidenceOptions {
  /** Filter by AIUC-1 domain. */
  domain?: Aiuc1Domain;
  /** Filter by control ID. */
  controlId?: ControlId;
  /** Filter by evidence type. */
  evidenceType?: EvidenceType;
  /** Filter by organization. */
  organizationId?: string;
  /** Maximum results (default: 25, max: 100). */
  first?: number;
  /** Cursor for pagination. */
  after?: string;
  /** Sort order (default: 'HEIGHT_DESC'). */
  sort?: 'HEIGHT_DESC' | 'HEIGHT_ASC';
  /** Filter by minimum block height. */
  minBlock?: number;
  /** Filter by maximum block height. */
  maxBlock?: number;
}

/** A single query result edge. */
export interface EvidenceQueryEdge {
  /** Arweave transaction ID. */
  txId: string;
  /** Owner wallet address. */
  owner: string;
  /** AIUC-1 control ID. */
  controlId: string;
  /** AIUC-1 domain. */
  domain: string;
  /** Evidence type. */
  evidenceType: string;
  /** Evidence label (if provided). */
  label: string | null;
  /** Organization ID (if provided). */
  organizationId: string | null;
  /** Block info (null if pending). */
  block: { height: number; timestamp: number } | null;
  /** Data size in bytes. */
  dataSize: number;
}

/** Result of querying evidence. */
export interface QueryEvidenceResult {
  /** Matching evidence edges. */
  edges: EvidenceQueryEdge[];
  /** Pagination info. */
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/** Options for verifying evidence against an anchor. */
export interface VerifyEvidenceOptions {
  /** The evidence data to verify. */
  data: Buffer | Uint8Array;
  /** Arweave transaction ID of the integrity proof. */
  txId: string;
}

/** Result of verifying evidence. */
export interface VerifyEvidenceResult {
  /** Whether the evidence matches the anchored hash. */
  valid: boolean;
  /** SHA-256 hash of the provided evidence (hex). */
  hash: string;
  /** SHA-256 hash stored on-chain (hex), or null if not found. */
  anchoredHash: string | null;
  /** AIUC-1 control ID from anchor tags. */
  controlId: string | null;
  /** AIUC-1 domain from anchor tags. */
  domain: string | null;
  /** Evidence type from anchor tags. */
  evidenceType: string | null;
  /** Block height of the anchor, or null if pending. */
  blockHeight: number | null;
  /** ISO timestamp of the anchor block, or null if pending. */
  timestamp: string | null;
}

/** Options for the full auditor verification flow. */
export interface AuditorVerifyOptions {
  /** Storage key/path of the evidence file. */
  storageKey: string;
  /** Arweave transaction ID of the integrity proof. */
  txId: string;
}

/** Result of the auditor verification flow. */
export interface AuditorVerifyResult {
  /** Whether the evidence is verified. */
  valid: boolean;
  /** SHA-256 hash of the retrieved evidence (hex). */
  hash: string;
  /** SHA-256 hash stored on-chain (hex), or null if not found. */
  anchoredHash: string | null;
  /** AIUC-1 control ID. */
  controlId: string | null;
  /** AIUC-1 domain. */
  domain: string | null;
  /** Evidence type. */
  evidenceType: string | null;
  /** Block height. */
  blockHeight: number | null;
  /** ISO timestamp. */
  timestamp: string | null;
  /** Where the evidence was retrieved from. */
  storageKey: string;
}

// --- Storage Adapter Interface ---

/** Abstract interface for enterprise storage backends. */
export interface StorageAdapter {
  /** Retrieve evidence data by key. */
  retrieve(key: string): Promise<Buffer>;
  /** Store evidence data, returning its key. */
  store(key: string, data: Buffer | Uint8Array): Promise<string>;
  /** Check if a key exists. */
  exists(key: string): Promise<boolean>;
}

/** Configuration for the S3 storage adapter. */
export interface S3AdapterConfig {
  /** S3 bucket name. */
  bucket: string;
  /** AWS region (e.g. 'us-east-1'). */
  region: string;
  /** Optional key prefix for all operations. */
  prefix?: string;
  /** Optional S3 endpoint URL (for S3-compatible services). */
  endpoint?: string;
  /** AWS credentials (if not using default credential chain). */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}
