/**
 * C2PA protocol types shared between sidecar and client SDK.
 */

/** Storage mode for C2PA data items on Arweave. */
export type StorageMode = 'full' | 'manifest' | 'proof';

/** A single ANS-104 tag (name-value pair). */
export interface Tag {
  name: string;
  value: string;
}

/** Complete set of tags for a C2PA data item. */
export interface C2PATagSet {
  /** Payload MIME type (standard Arweave tag). */
  contentType: string;
  /** C2PA manifest URN (e.g. urn:c2pa:UUID). */
  manifestId: string;
  /** Storage mode: full, manifest, or proof. */
  storageMode: StorageMode;
  /** base64url SHA-256 of the original asset. */
  assetHash: string;
  /** base64url SHA-256 of the manifest store. */
  manifestStoreHash: string;
  /** SBR API base URL. */
  manifestRepoUrl: string;
  /** Original media MIME type (Mode 2+3). */
  assetContentType?: string;
  /** Direct URL to retrieve manifest bytes (Mode 2+3). */
  manifestFetchUrl?: string;
  /** Soft binding algorithm identifier. */
  softBindingAlg?: string;
  /** Soft binding value. */
  softBindingValue?: string;
  /** Claim generator software/version. */
  claimGenerator?: string;
  /** Certificate fingerprint (opt-in). */
  signerFingerprint?: string;
  /** Certificate issuer (opt-in). */
  signerIssuer?: string;
}
