import type { StorageMode, Tag } from '@ar-io/c2pa-protocol';

/** Configuration for the TurboWithC2PA client. */
export interface TurboC2PAConfig {
  /** Base URL of the C2PA sidecar (e.g. https://gateway.io/c2pa). */
  c2paEndpoint: string;
  /** Storage mode for Arweave uploads. */
  storageMode: StorageMode;
  /** Fetch timeout in milliseconds (default: 10000). */
  timeoutMs?: number;
}

/** Result of a remote signing operation. */
export interface SignResult {
  /** IEEE P1363 format signature bytes. */
  signature: Uint8Array;
  /** Algorithm used (e.g. ES256). */
  algorithm: string;
}

/** Result of tag construction. */
export interface TagBuildResult {
  /** ANS-104 tags ready for Arweave upload. */
  tags: Tag[];
}

/** Options for building C2PA tags. */
export interface TagBuildOptions {
  /** Payload MIME type. */
  contentType: string;
  /** C2PA manifest URN. */
  manifestId: string;
  /** Storage mode. */
  storageMode: StorageMode;
  /** base64url SHA-256 of original asset. */
  assetHash: string;
  /** base64url SHA-256 of manifest store. */
  manifestStoreHash: string;
  /** SBR API base URL. */
  manifestRepoUrl: string;
  /** Original media MIME type (for mode manifest/proof). */
  assetContentType?: string;
  /** URL to retrieve manifest bytes (for mode manifest/proof). */
  manifestFetchUrl?: string;
  /** Soft binding algorithm. */
  softBindingAlg?: string;
  /** Soft binding value. */
  softBindingValue?: string;
  /** Claim generator software/version. */
  claimGenerator?: string;
}
