import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentProvenance } from '../src/provenance.js';

describe('ContentProvenance', () => {
  it('creates instance with valid config', () => {
    const provenance = new ContentProvenance({
      gatewayUrl: 'http://localhost:3000',
      trusthashUrl: 'http://localhost:5100',
      turboWallet: '0xdeadbeef',
    });
    expect(provenance).toBeInstanceOf(ContentProvenance);
  });

  it('creates instance without turboWallet (read-only)', () => {
    const provenance = new ContentProvenance({
      gatewayUrl: 'http://localhost:3000',
      trusthashUrl: 'http://localhost:5100',
    });
    expect(provenance).toBeInstanceOf(ContentProvenance);
  });

  it('throws on signAndAnchor without turboWallet', async () => {
    const provenance = new ContentProvenance({
      gatewayUrl: 'http://localhost:3000',
      trusthashUrl: 'http://localhost:5100',
    });
    await expect(provenance.signAndAnchor({ data: Buffer.from('test') })).rejects.toThrow(
      'turboWallet is required'
    );
  });
});
