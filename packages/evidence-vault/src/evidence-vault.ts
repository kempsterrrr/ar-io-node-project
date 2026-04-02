import { AgenticWay } from '@agenticway/sdk';
import type {
  EvidenceVaultConfig,
  AnchorEvidenceOptions,
  AnchorEvidenceResult,
  BatchAnchorEvidenceOptions,
  BatchAnchorEvidenceResult,
  QueryEvidenceOptions,
  QueryEvidenceResult,
  VerifyEvidenceOptions,
  VerifyEvidenceResult,
  AuditorVerifyOptions,
  AuditorVerifyResult,
  StorageAdapter,
} from './types.js';
import { executeAnchorEvidence } from './operations/anchor-evidence.js';
import { executeBatchAnchorEvidence } from './operations/batch-anchor-evidence.js';
import { executeQueryEvidence } from './operations/query-evidence.js';
import { executeVerifyEvidence } from './operations/verify-evidence.js';
import { executeAuditorVerify } from './operations/auditor-verify.js';

/**
 * AIUC-1 Compliance Evidence Vault.
 *
 * Provides tamper-proof integrity anchoring for compliance evidence
 * using SHA-256 hashing and Arweave proof storage.
 *
 * Evidence stays in enterprise storage; only cryptographic proofs
 * are anchored on Arweave.
 *
 * @example
 * ```ts
 * import { EvidenceVault, MemoryStorageAdapter } from '@agenticway/evidence-vault';
 *
 * const vault = new EvidenceVault({
 *   gatewayUrl: 'https://ario.agenticway.io',
 *   turboWallet: process.env.TURBO_WALLET,
 *   storage: new MemoryStorageAdapter(),
 * });
 *
 * // Anchor evidence
 * const result = await vault.anchorEvidence({
 *   data: Buffer.from(policyDocument),
 *   controlId: 'S001',
 *   evidenceType: 'policy-document',
 *   label: 'Access Control Policy v2.1',
 * });
 *
 * // Verify evidence
 * const verification = await vault.verifyEvidence({
 *   data: Buffer.from(policyDocument),
 *   txId: result.txId,
 * });
 * ```
 */
export class EvidenceVault {
  private sdk: AgenticWay;
  private storage: StorageAdapter | null;

  constructor(config: EvidenceVaultConfig) {
    this.sdk = new AgenticWay({
      gatewayUrl: config.gatewayUrl,
      turboWallet: config.turboWallet,
      timeoutMs: config.timeoutMs,
    });
    this.storage = config.storage ?? null;
  }

  /**
   * Anchor a single piece of compliance evidence on Arweave.
   *
   * Hashes the evidence, adds AIUC-1 control metadata,
   * and stores the integrity proof permanently.
   */
  async anchorEvidence(options: AnchorEvidenceOptions): Promise<AnchorEvidenceResult> {
    return executeAnchorEvidence(this.sdk, options);
  }

  /**
   * Batch-anchor multiple pieces of evidence using a Merkle tree.
   *
   * More efficient than individual anchors for bulk submissions.
   * Returns individual Merkle inclusion proofs for each item.
   */
  async batchAnchorEvidence(
    options: BatchAnchorEvidenceOptions
  ): Promise<BatchAnchorEvidenceResult> {
    return executeBatchAnchorEvidence(this.sdk, options);
  }

  /**
   * Query evidence proofs on Arweave.
   *
   * Filter by AIUC-1 domain, control ID, evidence type,
   * organization, and date range.
   */
  async queryEvidence(options: QueryEvidenceOptions = {}): Promise<QueryEvidenceResult> {
    return executeQueryEvidence(this.sdk, options);
  }

  /**
   * Verify evidence data against an existing Arweave anchor.
   *
   * Re-hashes the data and compares against the on-chain proof.
   */
  async verifyEvidence(options: VerifyEvidenceOptions): Promise<VerifyEvidenceResult> {
    return executeVerifyEvidence(this.sdk, options);
  }

  /**
   * Full auditor verification flow.
   *
   * Retrieves evidence from enterprise storage, hashes it,
   * and verifies against the Arweave anchor. Requires a
   * storage adapter to be configured.
   */
  async auditorVerify(options: AuditorVerifyOptions): Promise<AuditorVerifyResult> {
    if (!this.storage) {
      throw new Error(
        'EvidenceVault.auditorVerify(): storage adapter is required. ' +
          'Configure one via the storage option in EvidenceVaultConfig.'
      );
    }
    return executeAuditorVerify(this.sdk, this.storage, options);
  }
}
