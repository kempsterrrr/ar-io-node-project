import type { AgenticWay } from '@agenticway/sdk';
import type {
  VerifyProvenanceOptions,
  VerifyProvenanceResult,
  C2PAVerification,
  AnchorVerification,
} from '../types.js';
import { TAG_NAMES, TAG_VALUES, getTagValue } from '../tags.js';

/** C2PA protocol tag names from @ar-io/c2pa-protocol. */
const C2PA_TAGS = {
  PROTOCOL: 'Protocol',
  MANIFEST_ID: 'C2PA-Manifest-ID',
  STORAGE_MODE: 'C2PA-Storage-Mode',
  ASSET_HASH: 'C2PA-Asset-Hash',
  SOFT_BINDING_ALG: 'C2PA-Soft-Binding-Alg',
  SOFT_BINDING_VALUE: 'C2PA-Soft-Binding-Value',
} as const;

/**
 * Extract C2PA verification info from transaction tags.
 */
function extractC2PAInfo(tags: Array<{ name: string; value: string }>): C2PAVerification {
  const protocol = getTagValue(tags, C2PA_TAGS.PROTOCOL);
  const manifestId = getTagValue(tags, C2PA_TAGS.MANIFEST_ID);
  const storageMode = getTagValue(tags, C2PA_TAGS.STORAGE_MODE);
  const assetHash = getTagValue(tags, C2PA_TAGS.ASSET_HASH);
  const contentType = getTagValue(tags, 'Content-Type');
  const softBindingAlg = getTagValue(tags, C2PA_TAGS.SOFT_BINDING_ALG);
  const softBindingValue = getTagValue(tags, C2PA_TAGS.SOFT_BINDING_VALUE);

  // C2PA is valid if the protocol tag is present and we have a manifest ID
  const valid = protocol != null && manifestId != null;

  return {
    valid,
    manifestId,
    storageMode,
    assetHash,
    contentType,
    softBindingAlg,
    softBindingValue,
  };
}

/**
 * Find and verify the Layer 1 anchor for a provenance record.
 *
 * If anchorTxId is provided, verify it directly.
 * Otherwise, search for anchors that reference the content transaction.
 */
async function findAndVerifyAnchor(
  sdk: AgenticWay,
  contentTxId: string,
  anchorTxId?: string
): Promise<AnchorVerification | null> {
  // If we have a known anchor, fetch it directly by transaction ID
  if (anchorTxId) {
    const txInfo = await sdk.gateway.fetchTransactionInfo(anchorTxId);
    const anchoredHash = getTagValue(txInfo.tags, 'Data-Hash');
    const typeTag = getTagValue(txInfo.tags, TAG_NAMES.TYPE);
    const contentTxTag = getTagValue(txInfo.tags, TAG_NAMES.CONTENT_TX_ID);

    // Validate this is a provenance anchor that references our content
    const isValidAnchor =
      typeTag === TAG_VALUES.TYPE_PROVENANCE_ANCHOR &&
      contentTxTag === contentTxId &&
      anchoredHash != null;

    return {
      valid: isValidAnchor,
      txId: anchorTxId,
      anchoredHash,
      blockHeight: txInfo.block?.height ?? null,
      timestamp: txInfo.block ? new Date(txInfo.block.timestamp * 1000).toISOString() : null,
    };
  }

  // Search for anchors that reference this content transaction
  const result = await sdk.query({
    tags: [
      { name: TAG_NAMES.PROTOCOL, values: [TAG_VALUES.PROTOCOL] },
      { name: TAG_NAMES.TYPE, values: [TAG_VALUES.TYPE_PROVENANCE_ANCHOR] },
      { name: TAG_NAMES.CONTENT_TX_ID, values: [contentTxId] },
    ],
    first: 1,
    sort: 'HEIGHT_DESC',
  });

  if (result.edges.length === 0) {
    return null;
  }

  const edge = result.edges[0];
  const anchoredHash = getTagValue(edge.tags, 'Data-Hash');

  return {
    valid: anchoredHash != null,
    txId: edge.txId,
    anchoredHash,
    blockHeight: edge.block?.height ?? null,
    timestamp: edge.block ? new Date(edge.block.timestamp * 1000).toISOString() : null,
  };
}

/**
 * Verify content provenance: C2PA credentials + Layer 1 anchor.
 *
 * Performs:
 * 1. On-chain existence check via verify sidecar
 * 2. C2PA tag extraction and validation
 * 3. Layer 1 anchor lookup and verification
 */
export async function executeVerifyProvenance(
  sdk: AgenticWay,
  options: VerifyProvenanceOptions
): Promise<VerifyProvenanceResult> {
  // Step 1: Verify on-chain existence and integrity
  const verifyResult = await sdk.verify(options.contentTxId);

  const existence = verifyResult.existence;
  const dataSize = verifyResult.metadata.dataSize;
  const contentType = verifyResult.metadata.contentType;

  // Step 2: Extract C2PA info from transaction tags
  const c2pa = extractC2PAInfo(verifyResult.metadata.tags);

  // Step 3: Find and verify Layer 1 anchor
  const anchor = await findAndVerifyAnchor(sdk, options.contentTxId, options.anchorTxId);

  // Step 4: Determine owner from tags/verify result
  const ownerTag = getTagValue(verifyResult.metadata.tags, 'Owner');

  // Overall validity: SDK integrity passes + content exists + C2PA valid + anchor valid (if present)
  const integrityOk = verifyResult.valid && verifyResult.integrity.match !== false;
  const valid =
    integrityOk &&
    existence.status === 'confirmed' &&
    c2pa.valid &&
    (anchor == null || anchor.valid);

  return {
    valid,
    existence,
    c2pa,
    anchor,
    metadata: {
      dataSize,
      contentType,
      owner: ownerTag,
    },
  };
}
