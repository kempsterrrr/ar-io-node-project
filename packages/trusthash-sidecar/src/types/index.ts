/**
 * API Response Types
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Health Check Response
 */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  services: {
    database: 'healthy' | 'unhealthy' | 'unknown';
  };
  stats?: {
    indexedManifests: number;
  };
}

/**
 * Upload Response
 */
export interface UploadResponse {
  manifestTxId: string;
  arnsUndername: string;
  arnsUrl: string;
  phash: string;
  originalHash: string;
  hasPriorManifest: boolean;
}

/**
 * Search Result
 */
export interface SearchResult {
  manifestTxId: string;
  arnsUrl: string;
  distance: number;
  contentType: string;
}

export interface SearchResponse {
  query: {
    phash: string;
    threshold: number;
  };
  results: SearchResult[];
  total: number;
}

/**
 * Verification Response
 */
export interface VerificationResponse {
  manifestTxId: string;
  verified: boolean;
  manifest: {
    claimGenerator: string;
    created: string;
    signatureInfo: {
      issuer: string;
      algorithm: string;
      validFrom: string;
      validTo: string;
    };
    assertions: Array<{
      label: string;
      [key: string]: unknown;
    }>;
    ingredients: unknown[];
  } | null;
  validationStatus: {
    signatureValid: boolean;
    certificateValid: boolean;
    hashMatch: boolean | null;
    errors: string[];
    warnings: string[];
  };
}

/**
 * Webhook Payload (from gateway)
 */
export interface WebhookPayload {
  tx_id: string;
  tags: Array<{
    name: string;
    value: string;
  }>;
  owner: string;
  block_height: number;
}

/**
 * Database Manifest Record
 */
export interface ManifestRecord {
  id: number;
  manifest_tx_id: string;
  arns_undername: string;
  arns_full_url: string;
  original_hash: string;
  content_type: string;
  phash: number[];
  has_prior_manifest: boolean;
  claim_generator: string | null;
  owner_address: string;
  block_height: number | null;
  block_timestamp: Date | null;
  indexed_at: Date;
}
