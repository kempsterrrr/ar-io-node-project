/**
 * C2PA (Content Credentials) type definitions.
 *
 * Based on C2PA Specification 2.1:
 * https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html
 */

/**
 * C2PA action types from the specification
 */
export type C2PAActionType =
  | 'c2pa.created' // Asset was created
  | 'c2pa.opened' // Asset was opened for editing
  | 'c2pa.edited' // Asset was edited
  | 'c2pa.converted' // Asset format was converted
  | 'c2pa.published' // Asset was published
  | 'c2pa.repackaged' // Asset was repackaged
  | 'c2pa.transcoded' // Asset was transcoded
  | 'c2pa.redacted' // Parts of asset were redacted
  | 'c2pa.placed' // Asset was placed/composed
  | 'c2pa.resized' // Asset was resized
  | 'c2pa.cropped'; // Asset was cropped

/**
 * C2PA claim action
 */
export interface C2PAAction {
  action: C2PAActionType;
  when?: string; // ISO 8601 timestamp
  softwareAgent?: string;
  parameters?: Record<string, unknown>;
}

/**
 * C2PA claim generator info
 */
export interface C2PAClaimGenerator {
  name: string;
  version: string;
  icon?: string;
}

/**
 * C2PA thumbnail assertion data
 */
export interface C2PAThumbnail {
  contentType: string;
  data: Buffer;
}

/**
 * C2PA hash assertion
 */
export interface C2PAHashAssertion {
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
  hash: string; // Hex-encoded hash
}

/**
 * C2PA soft binding assertion (for pHash)
 */
export interface C2PASoftBinding {
  algorithm: 'pHash';
  value: string; // pHash value
}

/**
 * C2PA ingredient (prior manifest reference)
 */
export interface C2PAIngredient {
  title?: string;
  format?: string;
  instanceId: string;
  documentId?: string;
  manifestData?: {
    claimGenerator: string;
    created: string;
  };
}

/**
 * C2PA signature information
 */
export interface C2PASignatureInfo {
  issuer: string;
  algorithm: string;
  validFrom: string;
  validTo: string;
  isSelfSigned: boolean;
}

/**
 * C2PA assertion summary
 */
export interface C2PAAssertionSummary {
  label: string;
  kind?: string;
  data?: Record<string, unknown>;
}

/**
 * C2PA manifest summary (for API responses)
 */
export interface C2PAManifestSummary {
  claimGenerator: string;
  created: string;
  signatureInfo: C2PASignatureInfo;
  assertions: C2PAAssertionSummary[];
  ingredients: C2PAIngredient[];
}

/**
 * Validation status for C2PA manifest
 */
export interface C2PAValidationStatus {
  signatureValid: boolean;
  certificateValid: boolean;
  hashMatch: boolean | null; // null if original image not available
  errors: string[];
  warnings: string[];
}

/**
 * Options for creating a C2PA manifest
 */
export interface CreateManifestOptions {
  /** Original image buffer */
  imageBuffer: Buffer;
  /** Image content type */
  contentType: string;
  /** Thumbnail to embed */
  thumbnail: {
    buffer: Buffer;
    contentType: string;
  };
  /** SHA-256 hash of original image */
  originalHash: string;
  /** pHash of original image */
  pHash: string;
  /** ArNS URL where manifest will be stored */
  arnsUrl: string;
  /** Optional title/description */
  title?: string;
  /** Optional creator name */
  creator?: string;
  /** Optional prior manifest data (if image had existing C2PA) */
  priorManifest?: C2PAIngredient;
}

/**
 * Result of creating a C2PA manifest
 */
export interface CreateManifestResult {
  /** JUMBF manifest buffer */
  manifestBuffer: Buffer;
  /** Content type for manifest */
  contentType: string;
  /** Claim generator string */
  claimGenerator: string;
  /** Whether prior manifest was preserved */
  hasPriorManifest: boolean;
}

/**
 * Options for reading a C2PA manifest
 */
export interface ReadManifestOptions {
  /** Asset buffer (image with embedded manifest or JUMBF file) */
  buffer: Buffer;
  /** Whether the buffer is a standalone JUMBF file */
  isStandalone?: boolean;
}

/**
 * Result of reading a C2PA manifest
 */
export interface ReadManifestResult {
  /** Whether a manifest was found */
  found: boolean;
  /** Manifest summary if found */
  manifest?: C2PAManifestSummary;
  /** Raw manifest data */
  raw?: unknown;
  /** Error message if reading failed */
  error?: string;
}

/**
 * Result of verifying a C2PA manifest
 */
export interface VerifyManifestResult {
  /** Whether the manifest is valid */
  verified: boolean;
  /** Manifest summary */
  manifest?: C2PAManifestSummary;
  /** Detailed validation status */
  validationStatus: C2PAValidationStatus;
}
