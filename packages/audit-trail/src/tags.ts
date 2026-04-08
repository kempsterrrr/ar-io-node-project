/** Arweave tag names for audit trail transactions. */
export const TAG_NAMES = {
  PROTOCOL: 'Data-Protocol',
  TYPE: 'Type',
  HASH_ALGORITHM: 'Hash-Algorithm',
  TREE_TYPE: 'Tree-Type',
  MERKLE_ROOT: 'Merkle-Root',
  LEAF_COUNT: 'Leaf-Count',
  CONTENT_TYPE: 'Content-Type',
  // Audit-trail-specific tags
  AGENT_ID: 'Agent-Id',
  SESSION_ID: 'Session-Id',
  EVENT_TYPES: 'Event-Types',
  ENTRY_COUNT: 'Entry-Count',
  BATCH_START: 'Batch-Start',
  BATCH_END: 'Batch-End',
} as const;

/** Tag values used for audit trail transactions. */
export const TAG_VALUES = {
  PROTOCOL: 'AgenticWay-Integrity',
  TYPE_AUDIT_BATCH: 'integrity-audit-batch',
  HASH_ALGORITHM: 'SHA-256',
  TREE_TYPE: 'binary-merkle',
  CONTENT_TYPE: 'application/json',
} as const;
