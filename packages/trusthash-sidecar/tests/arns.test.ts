import { describe, expect, it, beforeAll, mock } from 'bun:test';
import {
  generateUndername,
  buildArnsUrl,
  parseArnsUrl,
  isArnsConfigured,
  getArnsStatus,
} from '../src/services/arns.service.js';

// Mock the config for testing
mock.module('../src/config.js', () => ({
  config: {
    ARNS_ROOT_NAME: 'testgateway',
    ARWEAVE_WALLET_FILE: './wallets/test-wallet.json',
    NODE_ENV: 'development',
  },
  isArnsTestnet: () => true,
}));

describe('ArNS service', () => {
  describe('generateUndername', () => {
    it('generates unique undernames', () => {
      const name1 = generateUndername();
      const name2 = generateUndername();

      expect(name1).not.toBe(name2);
    });

    it('generates undernames with th- prefix', () => {
      const name = generateUndername();
      expect(name.startsWith('th-')).toBe(true);
    });

    it('generates undernames with 8-char suffix', () => {
      const name = generateUndername();
      // Format: th-{8chars}
      expect(name.length).toBe(11); // "th-" + 8 chars
    });

    it('generates valid URL-safe names', () => {
      const name = generateUndername();
      // Should only contain alphanumeric and hyphen
      expect(/^[a-z0-9-]+$/.test(name)).toBe(true);
    });
  });

  describe('buildArnsUrl', () => {
    it('builds correct ArNS URL with undername', () => {
      const url = buildArnsUrl('th-abc12345');
      expect(url).toBe('https://th-abc12345_testgateway.arweave.net');
    });

    it('uses underscore separator for undernames', () => {
      const url = buildArnsUrl('my-undername');
      expect(url).toContain('_testgateway');
      expect(url).not.toContain('.testgateway');
    });

    it('includes https protocol', () => {
      const url = buildArnsUrl('test');
      expect(url.startsWith('https://')).toBe(true);
    });
  });

  describe('parseArnsUrl', () => {
    it('parses valid ArNS URL', () => {
      const result = parseArnsUrl('https://th-abc_mygateway.arweave.net');

      expect(result).not.toBeNull();
      expect(result?.undername).toBe('th-abc');
      expect(result?.rootName).toBe('mygateway');
    });

    it('handles complex undername', () => {
      const result = parseArnsUrl('https://th-abc12345_my-gateway.arweave.net');

      expect(result).not.toBeNull();
      expect(result?.undername).toBe('th-abc12345');
      expect(result?.rootName).toBe('my-gateway');
    });

    it('returns null for invalid URL', () => {
      expect(parseArnsUrl('not-a-url')).toBeNull();
      expect(parseArnsUrl('https://example.com')).toBeNull();
      expect(parseArnsUrl('https://simple.arweave.net')).toBeNull();
    });

    it('returns null for URL without undername', () => {
      // No underscore = no undername
      expect(parseArnsUrl('https://rootonly.arweave.net')).toBeNull();
    });
  });

  describe('isArnsConfigured', () => {
    it('returns true when both root name and process ID are set', () => {
      expect(isArnsConfigured()).toBe(true);
    });
  });

  describe('getArnsStatus', () => {
    it('returns configuration status', () => {
      const status = getArnsStatus();

      expect(status.configured).toBe(true);
      expect(status.rootName).toBe('testgateway');
      expect(status.network).toBe('testnet');
      // processId is undefined until first ArNS lookup
      expect(status.processId).toBeUndefined();
    });
  });

  // Note: Integration tests for createUndername, updateUndername, and getUndernameRecord
  // would require:
  // 1. A valid Arweave wallet with funds
  // 2. A configured ANT process
  // 3. Access to the AO network
  //
  // These are tested manually or in a dedicated integration test suite.
  // See: tests/integration/arns.integration.test.ts (to be created)

  describe('URL roundtrip', () => {
    it('generates parseable URLs', () => {
      const undername = generateUndername();
      const url = buildArnsUrl(undername);
      const parsed = parseArnsUrl(url);

      expect(parsed).not.toBeNull();
      expect(parsed?.undername).toBe(undername);
      expect(parsed?.rootName).toBe('testgateway');
    });
  });
});
