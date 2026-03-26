/**
 * Remote signer — calls the C2PA sidecar's signing oracle.
 *
 * This is the callback that c2pa-node uses for manifest signing.
 * It fetches the certificate chain and signs COSE payloads remotely.
 */

import type { SignResult } from './types.js';

export class RemoteSigner {
  readonly endpoint: string;
  private readonly timeoutMs: number;
  private certPem: string | null = null;

  constructor(endpoint: string, timeoutMs = 10000) {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  /**
   * Fetch the X.509 certificate chain from the sidecar.
   * Caches the result for subsequent calls.
   */
  async getCertificateChain(): Promise<string> {
    if (this.certPem) {
      return this.certPem;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}/v1/cert`, {
        signal: controller.signal,
      });

      if (response.status === 501) {
        throw new Error('Signing is not enabled on the sidecar');
      }

      if (!response.ok) {
        throw new Error(`Certificate fetch failed: ${response.status}`);
      }

      this.certPem = await response.text();
      return this.certPem;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Sign a COSE Sig_structure payload.
   *
   * This is the callback for c2pa-node's remote signer interface:
   *   remoteSigner.sign(bytesToSign) → signature
   *
   * Returns IEEE P1363 format signature (64 bytes for ES256).
   */
  async sign(payload: Uint8Array): Promise<SignResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}/v1/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: payload,
        signal: controller.signal,
      });

      if (response.status === 501) {
        throw new Error('Signing is not enabled on the sidecar');
      }

      if (!response.ok) {
        throw new Error(`Signing failed: ${response.status}`);
      }

      const signature = new Uint8Array(await response.arrayBuffer());

      return {
        signature,
        algorithm: 'ES256',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Clear the cached certificate (e.g. after cert rotation). */
  clearCache(): void {
    this.certPem = null;
  }
}
