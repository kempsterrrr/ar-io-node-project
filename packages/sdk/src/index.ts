// Main orchestrator
export { AgenticWay } from './agenticway.js';

// Types
export type {
  AgenticWayConfig,
  StoreOptions,
  StoreResult,
  RetrieveResult,
  VerifyOptions,
  VerifyResult,
  QueryOptions,
  QueryEdge,
  QueryResult,
  PageInfo,
  TagFilter,
  ResolveResult,
  SearchOptions,
  SearchMatch,
  SearchResult,
  GatewayInfo,
  AnchorOptions,
  AnchorResult,
  VerifyAnchorOptions,
  VerifyAnchorResult,
  BatchAnchorItem,
  BatchAnchorOptions,
  BatchAnchorProof,
  BatchAnchorResult,
} from './types.js';

// Clients (for advanced/direct use)
export { GatewayClient } from './clients/gateway.js';
export { SigningOracleClient } from './clients/signing-oracle.js';
export { ManifestRepoClient } from './clients/manifest-repo.js';
export { VerifyClient } from './clients/verify.js';

// C2PA utilities (provenance features)
export { detectContentType, SUPPORTED_CONTENT_TYPES } from './c2pa/detect.js';
export { buildTags } from './c2pa/tags.js';
export { uploadToArweave } from './c2pa/upload.js';

// Integrity primitives (Layer 1)
export {
  buildMerkleTree,
  generateProof,
  verifyProof,
  sha256Hex,
  type MerkleProof,
  type MerkleProofStep,
  type MerkleTreeResult,
} from './integrity/merkle.js';

// Re-export protocol constants
export {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  type Tag,
  type StorageMode,
  type C2PATagSet,
} from '@ar-io/c2pa-protocol';
