import { describe, it, expect, vi } from 'vitest';
import type { VerificationResult } from '../../src/types';

vi.mock('../../src/config.js', () => ({
  config: {
    PORT: 4001,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    GATEWAY_URL: 'http://localhost:9999',
    GATEWAY_TIMEOUT_MS: 5000,
    SQLITE_PATH: ':memory:',
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

describe('PDF Generator', () => {
  const baseTier1Result: VerificationResult = {
    verificationId: 'vrf_test123',
    timestamp: '2026-03-25T14:23:07.000Z',
    txId: '4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM',
    tier: 'full',
    existence: {
      status: 'confirmed',
      blockHeight: 1438221,
      blockTimestamp: '2026-03-14T14:47:12.000Z',
      blockId: 'xyz789',
      confirmations: 50000,
    },
    owner: {
      address: '37LN1vDKaqZi1fAwu9w',
      publicKey: 'pubkey123',
      signatureValid: null,
    },
    integrity: {
      status: 'verified',
      hash: 'sha256-b64:Ab3f7TestHash',
      onChainDigest: 'sha256-b64:Ab3f7TestHash',
      match: true,
      deepVerification: false,
    },
    metadata: {
      dataSize: 245678,
      contentType: 'application/pdf',
      tags: [
        { name: 'Content-Type', value: 'application/pdf' },
        { name: 'App-Name', value: 'TestApp' },
      ],
    },
    bundle: { isBundled: false, rootTransactionId: null },
    fileComparisons: [],
    receipt: {
      provided: false,
      signatureValid: null,
      receiptTimestamp: null,
      receiptOwner: null,
      ownerMatchesOnChain: null,
      receiptIdMatchesTxId: null,
      timestampPredatesBlock: null,
      turboStatus: null,
    },
    multiGateway: {
      enabled: false,
      totalQueried: 0,
      totalResponded: 0,
      totalAgreed: 0,
      consensusMet: false,
      gateways: [],
    },
    links: { dashboard: null, pdf: null, rawData: null },
  };

  it('generates a valid PDF for Tier 1 result', async () => {
    const { generatePdf } = await import('../../src/attestation/pdf-generator.js');
    const pdfBytes = await generatePdf(baseTier1Result);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(100);

    // Check PDF header magic bytes
    const header = new TextDecoder().decode(pdfBytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('generates a valid PDF for Tier 2 result', async () => {
    const tier2Result: VerificationResult = {
      ...baseTier1Result,
      tier: 'basic',
      integrity: {
        status: 'unavailable',
        hash: null,
        onChainDigest: null,
        match: null,
        deepVerification: false,
      },
    };

    const { generatePdf } = await import('../../src/attestation/pdf-generator.js');
    const pdfBytes = await generatePdf(tier2Result);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(100);
  });

  it('generates a valid PDF for bundled data item', async () => {
    const bundledResult: VerificationResult = {
      ...baseTier1Result,
      bundle: { isBundled: true, rootTransactionId: 'root-tx-123' },
    };

    const { generatePdf } = await import('../../src/attestation/pdf-generator.js');
    const pdfBytes = await generatePdf(bundledResult);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(100);
  });
});
