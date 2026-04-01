import type { VerifyResult } from '../types.js';

/** Raw verification response from the verify sidecar. */
interface VerifySidecarResponse {
  verificationId: string;
  timestamp: string;
  txId: string;
  tier: 'full' | 'basic';
  existence: {
    status: 'confirmed' | 'pending' | 'not_found';
    blockHeight: number | null;
    blockTimestamp: string | null;
    blockId: string | null;
    confirmations: number | null;
  };
  owner: {
    address: string | null;
    publicKey: string | null;
    signatureValid: boolean | null;
  };
  integrity: {
    status: 'verified' | 'unavailable';
    hash: string | null;
    onChainDigest: string | null;
    match: boolean | null;
    deepVerification: boolean;
  };
  metadata: {
    dataSize: number | null;
    contentType: string | null;
    tags: Array<{ name: string; value: string }>;
  };
  links: {
    dashboard: string | null;
    pdf: string | null;
    rawData: string | null;
  };
}

/** Typed HTTP client for the verify sidecar. */
export class VerifyClient {
  constructor(
    private baseUrl: string,
    private timeoutMs: number
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /** POST /api/v1/verify — verify an Arweave transaction. */
  async verify(txId: string): Promise<VerifyResult> {
    const res = await this.fetch('/api/v1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txId }),
    });
    const raw = (await res.json()) as VerifySidecarResponse;

    return {
      verificationId: raw.verificationId,
      valid:
        raw.existence.status === 'confirmed' &&
        (raw.integrity.status === 'verified' || raw.integrity.match === true),
      tier: raw.tier,
      existence: {
        status: raw.existence.status,
        blockHeight: raw.existence.blockHeight,
        blockTimestamp: raw.existence.blockTimestamp,
        confirmations: raw.existence.confirmations,
      },
      integrity: {
        status: raw.integrity.status,
        hash: raw.integrity.hash,
        match: raw.integrity.match,
      },
      metadata: {
        dataSize: raw.metadata.dataSize,
        contentType: raw.metadata.contentType,
        tags: raw.metadata.tags,
      },
      links: {
        dashboard: raw.links.dashboard,
        pdf: raw.links.pdf,
      },
    };
  }

  /** GET /api/v1/verify/:id — fetch a cached verification result. */
  async getResult(verificationId: string): Promise<VerifyResult | null> {
    try {
      const res = await this.fetch(`/api/v1/verify/${verificationId}`);
      const raw = (await res.json()) as VerifySidecarResponse;
      return {
        verificationId: raw.verificationId,
        valid:
          raw.existence.status === 'confirmed' &&
          (raw.integrity.status === 'verified' || raw.integrity.match === true),
        tier: raw.tier,
        existence: {
          status: raw.existence.status,
          blockHeight: raw.existence.blockHeight,
          blockTimestamp: raw.existence.blockTimestamp,
          confirmations: raw.existence.confirmations,
        },
        integrity: {
          status: raw.integrity.status,
          hash: raw.integrity.hash,
          match: raw.integrity.match,
        },
        metadata: {
          dataSize: raw.metadata.dataSize,
          contentType: raw.metadata.contentType,
          tags: raw.metadata.tags,
        },
        links: {
          dashboard: raw.links.dashboard,
          pdf: raw.links.pdf,
        },
      };
    } catch {
      return null;
    }
  }

  /** GET /health — sidecar health check. */
  async health(): Promise<boolean> {
    try {
      const res = await this.fetch('/health');
      return res.ok;
    } catch {
      return false;
    }
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Verify ${path}: HTTP ${res.status}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
