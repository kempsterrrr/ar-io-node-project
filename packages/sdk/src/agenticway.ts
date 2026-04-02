import { resolveConfig, type ResolvedConfig } from './config.js';
import type {
  AgenticWayConfig,
  AnchorOptions,
  AnchorResult,
  BatchAnchorOptions,
  BatchAnchorResult,
  GatewayInfo,
  QueryOptions,
  QueryResult,
  ResolveResult,
  RetrieveResult,
  SearchOptions,
  SearchResult,
  StoreOptions,
  StoreResult,
  VerifyAnchorOptions,
  VerifyAnchorResult,
  VerifyResult,
} from './types.js';
import { GatewayClient } from './clients/gateway.js';
import { SigningOracleClient } from './clients/signing-oracle.js';
import { ManifestRepoClient } from './clients/manifest-repo.js';
import { VerifyClient } from './clients/verify.js';
import { executeStore } from './operations/store.js';
import { executeRetrieve } from './operations/retrieve.js';
import { executeVerify } from './operations/verify.js';
import { executeSearch } from './operations/search.js';
import { executeQuery } from './operations/query.js';
import { executeResolve } from './operations/resolve.js';
import { executeAnchor } from './operations/anchor.js';
import { executeVerifyAnchor } from './operations/verify-anchor.js';
import { executeBatchAnchor } from './operations/batch-anchor.js';

/**
 * Main entry point for the @agenticway/sdk.
 *
 * Core operations (store, retrieve, verify, query, resolve) work with
 * just a gateway URL. Provenance features (C2PA signing, search) require
 * trusthashUrl configuration.
 */
export class AgenticWay {
  private config: ResolvedConfig;

  /** Gateway HTTP client for direct access. */
  readonly gateway: GatewayClient;
  /** Signing oracle client (null if trusthashUrl not configured). */
  readonly signer: SigningOracleClient | null;
  /** Manifest repository + search client (null if trusthashUrl not configured). */
  readonly manifests: ManifestRepoClient | null;
  /** Verify sidecar client. Uses gateway URL + /verify path by default. */
  readonly verifier: VerifyClient;

  constructor(config: AgenticWayConfig) {
    this.config = resolveConfig(config);

    this.gateway = new GatewayClient(this.config.gatewayUrl, this.config.timeoutMs);

    this.signer = this.config.trusthashUrl
      ? new SigningOracleClient(this.config.trusthashUrl, this.config.timeoutMs)
      : null;

    this.manifests = this.config.trusthashUrl
      ? new ManifestRepoClient(this.config.trusthashUrl, this.config.timeoutMs)
      : null;

    // Verify sidecar defaults to gateway URL (reverse-proxied at /verify)
    this.verifier = new VerifyClient(this.config.gatewayUrl, this.config.timeoutMs);
  }

  /**
   * Store data permanently on Arweave.
   *
   * By default, stores raw data with the given content type and tags.
   * Add `provenance` option to sign a C2PA manifest (requires trusthashUrl).
   */
  async store(options: StoreOptions): Promise<StoreResult> {
    return executeStore(this.config, this.gateway, this.signer, options);
  }

  /** Retrieve data from Arweave by transaction ID or ArNS name. */
  async retrieve(id: string): Promise<RetrieveResult> {
    return executeRetrieve(this.gateway, id);
  }

  /** Verify the on-chain existence and integrity of an Arweave transaction. */
  async verify(txId: string): Promise<VerifyResult> {
    return executeVerify(this.verifier, txId);
  }

  /**
   * Query for transactions on Arweave via GraphQL.
   *
   * Filter by tags, owners, block range. Supports cursor pagination.
   */
  async query(options: QueryOptions): Promise<QueryResult> {
    return executeQuery(this.gateway, options);
  }

  /** Resolve an ArNS name to an Arweave transaction ID. */
  async resolve(name: string): Promise<ResolveResult> {
    return executeResolve(this.gateway, name);
  }

  /**
   * Search for similar content by perceptual hash or image.
   *
   * Requires `trusthashUrl` in config (manifest repository endpoint).
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    if (!this.manifests) {
      throw new Error('AgenticWay.search(): trusthashUrl is required for search operations');
    }
    return executeSearch(this.manifests, options);
  }

  /**
   * Anchor data on Arweave by storing its SHA-256 hash.
   *
   * Creates a permanent integrity proof that the data existed at anchor time.
   * Requires `turboWallet` in config.
   */
  async anchor(options: AnchorOptions): Promise<AnchorResult> {
    return executeAnchor(this.config, options);
  }

  /**
   * Verify data against an existing integrity anchor on Arweave.
   *
   * Re-hashes the data and compares it against the hash stored on-chain.
   */
  async verifyAnchor(options: VerifyAnchorOptions): Promise<VerifyAnchorResult> {
    return executeVerifyAnchor(this.gateway, options);
  }

  /**
   * Anchor a batch of items using a Merkle tree.
   *
   * Builds a binary Merkle tree from item hashes, anchors the root on Arweave,
   * and returns individual inclusion proofs for each item.
   * Requires `turboWallet` in config.
   */
  async batchAnchor(options: BatchAnchorOptions): Promise<BatchAnchorResult> {
    return executeBatchAnchor(this.config, options);
  }

  /** Get gateway metadata. */
  async info(): Promise<GatewayInfo> {
    return this.gateway.info();
  }
}
