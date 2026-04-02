// Main entry point
export { EvidenceVault } from './evidence-vault.js';

// Types
export type {
  EvidenceVaultConfig,
  AnchorEvidenceOptions,
  AnchorEvidenceResult,
  BatchEvidenceItem,
  BatchAnchorEvidenceOptions,
  BatchEvidenceProof,
  BatchAnchorEvidenceResult,
  QueryEvidenceOptions,
  EvidenceQueryEdge,
  QueryEvidenceResult,
  VerifyEvidenceOptions,
  VerifyEvidenceResult,
  AuditorVerifyOptions,
  AuditorVerifyResult,
  StorageAdapter,
  S3AdapterConfig,
} from './types.js';

// AIUC-1 schema
export {
  type Aiuc1Domain,
  type EvidenceType,
  type ControlId,
  type ControlDefinition,
  DOMAIN_LABELS,
  CONTROLS,
  getControl,
  getControlsByDomain,
} from './schema/index.js';

// Protocol tags
export { TAG_NAMES, TAG_VALUES } from './tags.js';

// Storage adapters
export { MemoryStorageAdapter } from './storage/memory.js';
export { S3StorageAdapter } from './storage/s3.js';
