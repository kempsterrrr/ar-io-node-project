/** Arweave tag names for provenance anchor transactions. */
export const TAG_NAMES = {
  PROTOCOL: 'Data-Protocol',
  TYPE: 'Type',
  HASH_ALGORITHM: 'Hash-Algorithm',
  CONTENT_TYPE: 'Content-Type',
  MANIFEST_ID: 'C2PA-Manifest-ID',
  STORAGE_MODE: 'C2PA-Storage-Mode',
  ASSET_HASH: 'C2PA-Asset-Hash',
  MANIFEST_STORE_HASH: 'C2PA-Manifest-Store-Hash',
  MANIFEST_REPO_URL: 'C2PA-Manifest-Repo-URL',
  SOFT_BINDING_ALG: 'C2PA-Soft-Binding-Alg',
  SOFT_BINDING_VALUE: 'C2PA-Soft-Binding-Value',
  CONTENT_TX_ID: 'Content-Tx-Id',
  ANCHOR_TX_ID: 'Provenance-Anchor-Tx-Id',
} as const;

/** Arweave tag values for provenance transactions. */
export const TAG_VALUES = {
  PROTOCOL: 'AgenticWay-Integrity',
  TYPE_PROVENANCE_ANCHOR: 'integrity-provenance-anchor',
  HASH_ALGORITHM: 'SHA-256',
  CONTENT_TYPE: 'application/json',
} as const;

/** Extract a tag value from a tag array. */
export function getTagValue(
  tags: Array<{ name: string; value: string }>,
  name: string
): string | null {
  return tags.find((t) => t.name === name)?.value ?? null;
}
