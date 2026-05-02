// Main class
export { ContentProvenance } from './provenance.js';

// Types
export type {
  ProvenanceConfig,
  DigitalSourceType,
  SignAndAnchorOptions,
  SignAndAnchorResult,
  VerifyProvenanceOptions,
  VerifyProvenanceResult,
  C2PAVerification,
  AnchorVerification,
  QueryProvenanceOptions,
  QueryProvenanceResult,
  ProvenanceRecord,
} from './types.js';

// Tags
export { TAG_NAMES, TAG_VALUES, getTagValue } from './tags.js';

// Schema
export {
  SOURCE_TYPE_LABELS,
  VALID_SOURCE_TYPES,
  isValidSourceType,
} from './schema/source-types.js';

// Operations (for advanced/direct use)
export { executeSignAndAnchor } from './operations/sign-and-anchor.js';
export { executeVerifyProvenance } from './operations/verify-provenance.js';
export { executeQueryProvenance } from './operations/query-provenance.js';
