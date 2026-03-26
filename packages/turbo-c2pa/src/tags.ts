/**
 * ANS-104 tag builder for C2PA data items.
 *
 * Constructs the complete tag set for uploading C2PA manifest/proof
 * records to Arweave. Uses constants from @ar-io/c2pa-protocol.
 */

import {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TAG_PROTOCOL,
  TAG_PROTOCOL_VERSION,
  TAG_MANIFEST_ID,
  TAG_STORAGE_MODE,
  TAG_ASSET_HASH,
  TAG_MANIFEST_STORE_HASH,
  TAG_MANIFEST_REPO_URL,
  TAG_ASSET_CONTENT_TYPE,
  TAG_MANIFEST_FETCH_URL,
  TAG_SOFT_BINDING_ALG,
  TAG_SOFT_BINDING_VALUE,
  TAG_CLAIM_GENERATOR,
  type Tag,
} from '@ar-io/c2pa-protocol';
import type { TagBuildOptions, TagBuildResult } from './types.js';

/**
 * Build the ANS-104 tag array for a C2PA data item.
 */
export function buildTags(options: TagBuildOptions): TagBuildResult {
  const tags: Tag[] = [
    // Required (all modes)
    { name: 'Content-Type', value: options.contentType },
    { name: TAG_PROTOCOL, value: PROTOCOL_NAME },
    { name: TAG_PROTOCOL_VERSION, value: PROTOCOL_VERSION },
    { name: TAG_MANIFEST_ID, value: options.manifestId },
    { name: TAG_STORAGE_MODE, value: options.storageMode },
    { name: TAG_ASSET_HASH, value: options.assetHash },
    { name: TAG_MANIFEST_STORE_HASH, value: options.manifestStoreHash },
    { name: TAG_MANIFEST_REPO_URL, value: options.manifestRepoUrl },
  ];

  // Mode 2+3: asset content type and fetch URL
  if (options.assetContentType) {
    tags.push({ name: TAG_ASSET_CONTENT_TYPE, value: options.assetContentType });
  }
  if (options.manifestFetchUrl) {
    tags.push({ name: TAG_MANIFEST_FETCH_URL, value: options.manifestFetchUrl });
  }

  // Soft binding
  if (options.softBindingAlg && options.softBindingValue) {
    tags.push({ name: TAG_SOFT_BINDING_ALG, value: options.softBindingAlg });
    tags.push({ name: TAG_SOFT_BINDING_VALUE, value: options.softBindingValue });
  }

  // Optional metadata
  if (options.claimGenerator) {
    tags.push({ name: TAG_CLAIM_GENERATOR, value: options.claimGenerator });
  }

  return { tags };
}
