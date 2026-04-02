import type { AgenticWay } from '@agenticway/sdk';
import type { SignAndAnchorOptions, SignAndAnchorResult } from '../types.js';
import { TAG_NAMES, TAG_VALUES } from '../tags.js';

/**
 * Sign content with C2PA manifest and anchor the manifest hash on Arweave.
 *
 * Two-step process:
 * 1. Store content with C2PA provenance via sdk.store()
 * 2. Anchor the manifest metadata hash via sdk.anchor()
 *
 * This creates a dual-proof: C2PA manifest for content credentials +
 * Layer 1 integrity anchor for permanent, chain-verifiable proof.
 */
export async function executeSignAndAnchor(
  sdk: AgenticWay,
  options: SignAndAnchorOptions
): Promise<SignAndAnchorResult> {
  const data = Buffer.isBuffer(options.data) ? options.data : Buffer.from(options.data);

  // Step 1: Store content with C2PA provenance signing
  const storeResult = await sdk.store({
    data,
    contentType: options.contentType,
    provenance: {
      sourceType: options.sourceType,
      claimGenerator: options.claimGenerator ?? '@agenticway/provenance/0.1.0',
    },
    tags: options.metadata,
  });

  if (!storeResult.provenance) {
    throw new Error(
      'ContentProvenance.signAndAnchor(): C2PA signing failed — no provenance in store result'
    );
  }

  // Step 2: Anchor the manifest metadata as a Layer 1 integrity proof
  const manifestPayload = Buffer.from(
    JSON.stringify({
      contentTxId: storeResult.txId,
      manifestId: storeResult.provenance.manifestId,
      assetHash: storeResult.provenance.assetHash,
    }),
    'utf-8'
  );

  const anchorResult = await sdk.anchor({
    data: manifestPayload,
    metadata: {
      ...(options.metadata ?? {}),
      [TAG_NAMES.TYPE]: TAG_VALUES.TYPE_PROVENANCE_ANCHOR,
      [TAG_NAMES.MANIFEST_ID]: storeResult.provenance.manifestId,
      [TAG_NAMES.ASSET_HASH]: storeResult.provenance.assetHash,
      [TAG_NAMES.CONTENT_TX_ID]: storeResult.txId,
    },
  });

  return {
    contentTxId: storeResult.txId,
    viewUrl: storeResult.viewUrl,
    manifestId: storeResult.provenance.manifestId,
    assetHash: storeResult.provenance.assetHash,
    anchorTxId: anchorResult.txId,
    anchorHash: anchorResult.hash,
    timestamp: anchorResult.timestamp,
  };
}
