// Main orchestrator
export { ArIO } from './ario.js';

// Types
export type {
  ArIOConfig,
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

// Re-export protocol constants
export {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  type Tag,
  type StorageMode,
  type C2PATagSet,
} from '@ar-io/c2pa-protocol';
