import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config.js';

describe('resolveConfig', () => {
  it('resolves minimal config', () => {
    const config = resolveConfig({ gatewayUrl: 'http://localhost:3000' });
    expect(config.gatewayUrl).toBe('http://localhost:3000');
    expect(config.signingOracleUrl).toBeNull();
    expect(config.turboWallet).toBeNull();
    expect(config.timeoutMs).toBe(15_000);
  });

  it('strips trailing slashes from URLs', () => {
    const config = resolveConfig({
      gatewayUrl: 'http://localhost:3000/',
      signingOracleUrl: 'http://localhost:3000/trusthash/v1/',
    });
    expect(config.gatewayUrl).toBe('http://localhost:3000');
    expect(config.signingOracleUrl).toBe('http://localhost:3000/trusthash/v1');
  });

  it('passes through turboWallet and timeoutMs', () => {
    const config = resolveConfig({
      gatewayUrl: 'http://localhost:3000',
      turboWallet: '0xabc',
      timeoutMs: 5000,
    });
    expect(config.turboWallet).toBe('0xabc');
    expect(config.timeoutMs).toBe(5000);
  });

  it('throws if gatewayUrl is missing', () => {
    expect(() => resolveConfig({ gatewayUrl: '' })).toThrow('gatewayUrl is required');
  });
});
