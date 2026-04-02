import type { AgenticWayConfig, BatchAnchorResult, BatchAnchorProof } from '@agenticway/sdk';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** Categories of agent activity events. */
export type AgentEventType =
  | 'tool_call'
  | 'tool_result'
  | 'model_request'
  | 'model_response'
  | 'chain_start'
  | 'chain_end'
  | 'decision'
  | 'data_access'
  | 'error'
  | 'custom';

/** A single audit log entry representing one agent activity event. */
export interface AuditLogEntry {
  /** Unique entry ID (auto-generated if not provided). */
  id: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Agent identifier. */
  agentId: string;
  /** Session or conversation ID. */
  sessionId?: string;
  /** Event category. */
  eventType: AgentEventType;
  /** Human-readable action description. */
  action: string;
  /** Input data (tool params, prompt, etc.). Serialized to JSON for anchoring. */
  input?: unknown;
  /** Output data (tool result, response, etc.). Serialized to JSON for anchoring. */
  output?: unknown;
  /** Free-form metadata. */
  metadata?: Record<string, string>;
  /** Parent event ID for linking related events. */
  parentEventId?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Batching strategy configuration. */
export interface BatchConfig {
  /** Max entries before auto-flush (default: 100). */
  maxEntries?: number;
  /** Max interval in ms before auto-flush (default: 300_000 = 5 min). */
  maxIntervalMs?: number;
  /** Enable automatic flushing (default: true). */
  autoFlush?: boolean;
}

/** AuditTrail constructor configuration. */
export interface AuditTrailConfig {
  /** Gateway base URL. */
  gatewayUrl: string;
  /** Ethereum private key for Turbo uploads (hex). */
  turboWallet?: string;
  /** Default agent ID attached to all log entries. */
  agentId: string;
  /** Default session ID attached to all log entries. */
  sessionId?: string;
  /** Batching configuration. */
  batch?: BatchConfig;
}

// ---------------------------------------------------------------------------
// Operation options & results
// ---------------------------------------------------------------------------

/** Options for logging a single event. */
export interface LogEventOptions {
  /** Event category. */
  eventType: AgentEventType;
  /** Human-readable action description. */
  action: string;
  /** Input data. */
  input?: unknown;
  /** Output data. */
  output?: unknown;
  /** Free-form metadata. */
  metadata?: Record<string, string>;
  /** Parent event ID. */
  parentEventId?: string;
  /** Override default agent ID. */
  agentId?: string;
  /** Override default session ID. */
  sessionId?: string;
}

/** Result of a flush operation (batch anchor). */
export interface FlushResult {
  /** Arweave transaction ID of the batch anchor. */
  txId: string;
  /** Merkle root hash (hex). */
  merkleRoot: string;
  /** Number of entries anchored. */
  entryCount: number;
  /** Individual proofs keyed by entry ID. */
  proofs: Map<string, EntryProof>;
  /** ISO timestamp of the anchor. */
  timestamp: string;
}

/** Merkle proof for a single log entry within a batch. */
export interface EntryProof {
  /** Entry ID. */
  entryId: string;
  /** Index in the batch. */
  index: number;
  /** SHA-256 hash of the entry (hex). */
  hash: string;
  /** Merkle inclusion proof path. */
  proof: Array<{ hash: string; position: 'left' | 'right' }>;
}

/** Options for verifying a single log entry. */
export interface VerifyEntryOptions {
  /** The log entry to verify. */
  entry: AuditLogEntry;
  /** Arweave transaction ID of the batch anchor. */
  txId: string;
  /** Merkle proof for this entry (from FlushResult.proofs). */
  proof: EntryProof;
}

/** Result of verifying a log entry. */
export interface VerifyEntryResult {
  /** Whether the entry is valid (hash matches, Merkle proof valid, root matches on-chain). */
  valid: boolean;
  /** SHA-256 hash of the entry (hex). */
  entryHash: string;
  /** Whether the Merkle inclusion proof is valid. */
  merkleProofValid: boolean;
  /** Whether the Merkle root matches the on-chain anchor. */
  onChainValid: boolean;
  /** Block height of the anchor transaction. */
  blockHeight: number | null;
  /** ISO timestamp of the anchor block. */
  timestamp: string | null;
}

/** Options for querying anchored audit logs. */
export interface QueryLogsOptions {
  /** Filter by agent ID. */
  agentId?: string;
  /** Filter by session ID. */
  sessionId?: string;
  /** Filter by event types. */
  eventTypes?: AgentEventType[];
  /** Max results (default: 25). */
  first?: number;
  /** Pagination cursor. */
  after?: string;
  /** Sort order (default: 'HEIGHT_DESC'). */
  sort?: 'HEIGHT_DESC' | 'HEIGHT_ASC';
  /** Filter by minimum block height. */
  minBlock?: number;
  /** Filter by maximum block height. */
  maxBlock?: number;
}

/** A single query result edge. */
export interface AuditLogEdge {
  /** Arweave transaction ID. */
  txId: string;
  /** Agent ID from tags. */
  agentId: string | null;
  /** Session ID from tags. */
  sessionId: string | null;
  /** Event types in this batch (comma-separated in tag). */
  eventTypes: string | null;
  /** Entry count in the batch. */
  entryCount: string | null;
  /** Block info. */
  block: { height: number; timestamp: number } | null;
}

/** Result of querying audit logs. */
export interface QueryLogsResult {
  /** Matching edges. */
  edges: AuditLogEdge[];
  /** Pagination info. */
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/** Generic adapter interface for capturing agent events. */
export interface AuditAdapter {
  /** Called when an agent event occurs. Returns the entry ID. */
  onEvent(event: LogEventOptions): Promise<string>;
}
