/**
 * Arweave transaction tag constants for evidence vault anchors.
 *
 * These extend the base AgenticWay-Integrity protocol with
 * AIUC-1 compliance-specific metadata.
 */

/** Evidence anchor tag names. */
export const TAG_NAMES = {
  PROTOCOL: 'Data-Protocol',
  TYPE: 'Type',
  HASH_ALGORITHM: 'Hash-Algorithm',
  DATA_HASH: 'Data-Hash',
  TREE_TYPE: 'Tree-Type',
  MERKLE_ROOT: 'Merkle-Root',
  LEAF_COUNT: 'Leaf-Count',
  CONTENT_TYPE: 'Content-Type',

  // AIUC-1 specific
  AIUC1_CONTROL_ID: 'AIUC1-Control-Id',
  AIUC1_DOMAIN: 'AIUC1-Domain',
  EVIDENCE_TYPE: 'Evidence-Type',
  EVIDENCE_LABEL: 'Evidence-Label',
  ORGANIZATION_ID: 'Organization-Id',
} as const;

/** Fixed tag values for evidence anchors. */
export const TAG_VALUES = {
  PROTOCOL: 'AgenticWay-Integrity',
  TYPE_EVIDENCE: 'integrity-evidence-anchor',
  TYPE_EVIDENCE_BATCH: 'integrity-evidence-batch-anchor',
  HASH_ALGORITHM: 'SHA-256',
  TREE_TYPE: 'binary-merkle',
  CONTENT_TYPE: 'application/json',
} as const;
