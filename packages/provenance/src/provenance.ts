import { AgenticWay } from '@agenticway/sdk';
import type {
  ProvenanceConfig,
  SignAndAnchorOptions,
  SignAndAnchorResult,
  VerifyProvenanceOptions,
  VerifyProvenanceResult,
  QueryProvenanceOptions,
  QueryProvenanceResult,
} from './types.js';
import { executeSignAndAnchor } from './operations/sign-and-anchor.js';
import { executeVerifyProvenance } from './operations/verify-provenance.js';
import { executeQueryProvenance } from './operations/query-provenance.js';

/**
 * C2PA content provenance with Arweave integrity anchoring.
 *
 * Combines C2PA content credentials (Layer 2) with Arweave hash anchoring
 * (Layer 1) to provide dual-proof provenance for AI-generated content.
 *
 * @example
 * ```ts
 * const provenance = new ContentProvenance({
 *   gatewayUrl: 'https://ario.agenticway.io',
 *   trusthashUrl: 'http://localhost:5100',
 *   turboWallet: process.env.TURBO_WALLET,
 * });
 *
 * // Sign and anchor content
 * const result = await provenance.signAndAnchor({
 *   data: imageBuffer,
 *   sourceType: 'trainedAlgorithmicMedia',
 * });
 *
 * // Verify provenance
 * const verification = await provenance.verify({
 *   contentTxId: result.contentTxId,
 *   anchorTxId: result.anchorTxId,
 * });
 * ```
 */
export class ContentProvenance {
  private sdk: AgenticWay;
  private config: ProvenanceConfig;

  constructor(config: ProvenanceConfig) {
    this.config = config;
    this.sdk = new AgenticWay({
      gatewayUrl: config.gatewayUrl,
      trusthashUrl: config.trusthashUrl,
      turboWallet: config.turboWallet,
      timeoutMs: config.timeoutMs,
    });
  }

  /**
   * Sign content with C2PA manifest and anchor the manifest hash on Arweave.
   *
   * Creates a dual-proof provenance chain:
   * 1. C2PA manifest embedded in/alongside the content (identity, process, lineage)
   * 2. Layer 1 integrity anchor of manifest metadata on Arweave (permanence)
   *
   * Requires: turboWallet in config.
   */
  async signAndAnchor(options: SignAndAnchorOptions): Promise<SignAndAnchorResult> {
    if (!this.config.turboWallet) {
      throw new Error('ContentProvenance.signAndAnchor(): turboWallet is required');
    }
    return executeSignAndAnchor(this.sdk, options);
  }

  /**
   * Verify content provenance: C2PA credentials + Layer 1 anchor.
   *
   * Performs three checks:
   * 1. On-chain existence and data integrity (via verify sidecar)
   * 2. C2PA tag validation (protocol, manifest ID, storage mode)
   * 3. Layer 1 anchor verification (if anchorTxId provided or discoverable)
   */
  async verify(options: VerifyProvenanceOptions): Promise<VerifyProvenanceResult> {
    return executeVerifyProvenance(this.sdk, options);
  }

  /**
   * Query provenance records from Arweave.
   *
   * Searches for C2PA-tagged transactions. Supports filtering by
   * manifest ID, content type, and owner address.
   */
  async queryProvenance(options: QueryProvenanceOptions = {}): Promise<QueryProvenanceResult> {
    return executeQueryProvenance(this.sdk, options);
  }

  /**
   * Search for visually similar content using perceptual hashing.
   *
   * Delegates to the SDK's search() which uses the trusthash sidecar's
   * pHash similarity search. Requires trusthashUrl in config.
   */
  async searchSimilar(options: {
    image?: Buffer | Uint8Array;
    phash?: string;
    threshold?: number;
    limit?: number;
  }) {
    return this.sdk.search(options);
  }
}
