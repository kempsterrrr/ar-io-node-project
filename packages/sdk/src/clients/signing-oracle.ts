/** Result of a remote signing operation. */
export interface SignResult {
  /** IEEE P1363 format signature bytes. */
  signature: Uint8Array;
  /** Algorithm used (e.g. ES256). */
  algorithm: string;
}

/**
 * Client for the trusthash sidecar signing oracle.
 * Extracted from turbo-c2pa RemoteSigner.
 */
export class SigningOracleClient {
  private cachedCertPem: string | null = null;

  constructor(
    private endpoint: string,
    private timeoutMs: number
  ) {
    this.endpoint = endpoint.replace(/\/+$/, '');
  }

  /** GET /v1/cert — fetch X.509 certificate chain PEM. */
  async getCertificateChain(): Promise<string> {
    if (this.cachedCertPem) return this.cachedCertPem;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.endpoint}/cert`, {
        signal: controller.signal,
      });

      if (res.status === 501) {
        throw new Error('Signing oracle: signing not enabled on this sidecar');
      }
      if (!res.ok) {
        throw new Error(`Signing oracle /cert: HTTP ${res.status}`);
      }

      this.cachedCertPem = await res.text();
      return this.cachedCertPem;
    } finally {
      clearTimeout(timer);
    }
  }

  /** POST /v1/sign — sign COSE payload bytes. */
  async sign(payload: Uint8Array): Promise<SignResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.endpoint}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Signing oracle /sign: HTTP ${res.status}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      return {
        signature: new Uint8Array(arrayBuffer),
        algorithm: 'ES256',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Clear cached certificate (e.g. after rotation). */
  clearCache(): void {
    this.cachedCertPem = null;
  }
}
