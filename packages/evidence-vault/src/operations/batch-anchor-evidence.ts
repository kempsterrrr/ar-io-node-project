import type { AgenticWay } from '@agenticway/sdk';
import { sha256Hex } from '@agenticway/sdk';
import type {
  BatchAnchorEvidenceOptions,
  BatchAnchorEvidenceResult,
  BatchEvidenceProof,
} from '../types.js';
import { getControl } from '../schema/domains.js';
import { TAG_NAMES, TAG_VALUES } from '../tags.js';

/**
 * Batch-anchor multiple pieces of compliance evidence using a Merkle tree.
 *
 * Builds a Merkle tree from all evidence item hashes, anchors the root
 * on Arweave, and returns individual inclusion proofs for each item.
 */
export async function executeBatchAnchorEvidence(
  sdk: AgenticWay,
  options: BatchAnchorEvidenceOptions
): Promise<BatchAnchorEvidenceResult> {
  if (options.items.length === 0) {
    throw new Error('EvidenceVault.batchAnchorEvidence(): items array must not be empty');
  }

  // Validate all control IDs upfront
  const controls = options.items.map((item) => {
    const control = getControl(item.controlId);
    if (!control) {
      throw new Error(`Unknown AIUC-1 control ID: ${item.controlId}`);
    }
    return control;
  });

  // Build batch metadata
  const metadata: Record<string, string> = {
    [TAG_NAMES.TYPE]: TAG_VALUES.TYPE_EVIDENCE_BATCH,
  };

  // Collect unique domains and controls for batch-level tags
  const domains = [...new Set(controls.map((c) => c.domain))];
  const controlIds = [...new Set(options.items.map((i) => i.controlId))];
  metadata['AIUC1-Domains'] = domains.join(',');
  metadata['AIUC1-Control-Ids'] = controlIds.join(',');

  if (options.organizationId) {
    metadata[TAG_NAMES.ORGANIZATION_ID] = options.organizationId;
  }
  if (options.metadata) {
    Object.assign(metadata, options.metadata);
  }

  const result = await sdk.batchAnchor({
    items: options.items.map((item) => ({ data: item.data })),
    metadata,
  });

  // Enrich proofs with AIUC-1 metadata
  const proofs: BatchEvidenceProof[] = result.proofs.map((proof, index) => ({
    index: proof.index,
    hash: proof.hash,
    controlId: options.items[index].controlId,
    evidenceType: options.items[index].evidenceType,
    proof: proof.proof,
  }));

  return {
    txId: result.txId,
    merkleRoot: result.merkleRoot,
    proofs,
    timestamp: result.timestamp,
  };
}
