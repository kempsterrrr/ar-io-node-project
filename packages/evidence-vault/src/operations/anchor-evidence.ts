import type { AgenticWay } from '@agenticway/sdk';
import type { AnchorEvidenceOptions, AnchorEvidenceResult } from '../types.js';
import { getControl } from '../schema/domains.js';
import { TAG_NAMES, TAG_VALUES } from '../tags.js';

/**
 * Anchor a single piece of compliance evidence on Arweave.
 *
 * Hashes the evidence data, adds AIUC-1 control metadata as tags,
 * and stores the integrity proof on Arweave via the SDK.
 */
export async function executeAnchorEvidence(
  sdk: AgenticWay,
  options: AnchorEvidenceOptions
): Promise<AnchorEvidenceResult> {
  const control = getControl(options.controlId);
  if (!control) {
    throw new Error(`Unknown AIUC-1 control ID: ${options.controlId}`);
  }

  const metadata: Record<string, string> = {
    [TAG_NAMES.TYPE]: TAG_VALUES.TYPE_EVIDENCE,
    [TAG_NAMES.AIUC1_CONTROL_ID]: options.controlId,
    [TAG_NAMES.AIUC1_DOMAIN]: control.domain,
    [TAG_NAMES.EVIDENCE_TYPE]: options.evidenceType,
  };

  if (options.label) {
    metadata[TAG_NAMES.EVIDENCE_LABEL] = options.label;
  }
  if (options.organizationId) {
    metadata[TAG_NAMES.ORGANIZATION_ID] = options.organizationId;
  }
  if (options.metadata) {
    Object.assign(metadata, options.metadata);
  }

  const result = await sdk.anchor({
    data: options.data,
    metadata,
  });

  return {
    txId: result.txId,
    hash: result.hash,
    controlId: options.controlId,
    domain: control.domain,
    evidenceType: options.evidenceType,
    timestamp: result.timestamp,
  };
}
