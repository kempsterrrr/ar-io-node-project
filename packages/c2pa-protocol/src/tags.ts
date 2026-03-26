/**
 * C2PA ANS-104 tag name constants.
 *
 * These are the tag names used on Arweave data items for C2PA manifest
 * and proof records. Tags are permanent once on-chain — do not change
 * these values without bumping PROTOCOL_VERSION.
 */

// Protocol identification
export const PROTOCOL_NAME = 'C2PA-Manifest-Proof';
export const PROTOCOL_VERSION = '1.0.0';

// Required tags (all modes)
export const TAG_PROTOCOL = 'Protocol';
export const TAG_PROTOCOL_VERSION = 'Protocol-Version';
export const TAG_CONTENT_TYPE = 'Content-Type';
export const TAG_MANIFEST_ID = 'C2PA-Manifest-ID';
export const TAG_STORAGE_MODE = 'C2PA-Storage-Mode';
export const TAG_ASSET_HASH = 'C2PA-Asset-Hash';
export const TAG_MANIFEST_STORE_HASH = 'C2PA-Manifest-Store-Hash';
export const TAG_MANIFEST_REPO_URL = 'C2PA-Manifest-Repo-URL';

// Required for Mode 2 + 3
export const TAG_ASSET_CONTENT_TYPE = 'C2PA-Asset-Content-Type';
export const TAG_MANIFEST_FETCH_URL = 'C2PA-Manifest-Fetch-URL';

// Soft binding (one set per data item)
export const TAG_SOFT_BINDING_ALG = 'C2PA-Soft-Binding-Alg';
export const TAG_SOFT_BINDING_VALUE = 'C2PA-Soft-Binding-Value';

// Optional metadata
export const TAG_CLAIM_GENERATOR = 'C2PA-Claim-Generator';

// Opt-in (high privacy risk)
export const TAG_SIGNER_FINGERPRINT = 'C2PA-Signer-Fingerprint';
export const TAG_SIGNER_ISSUER = 'C2PA-Signer-Issuer';

// Soft binding algorithm identifiers
export const ALG_PHASH = 'org.ar-io.phash';
export const ALG_ISCC = 'io.iscc.v0';
