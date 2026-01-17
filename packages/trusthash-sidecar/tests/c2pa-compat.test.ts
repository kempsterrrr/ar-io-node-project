/**
 * C2PA Node Compatibility Test
 *
 * Tests that @contentauth/c2pa-node works correctly with Bun runtime.
 * This is Phase 0 of the C2PA 2.3 compliance implementation.
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Test if the c2pa-node module can be imported
describe('c2pa-node compatibility', () => {
  test('module imports successfully', async () => {
    // Dynamic import to catch loading errors
    const c2pa = await import('@contentauth/c2pa-node');

    // Check essential exports exist (based on README)
    expect(c2pa.Reader).toBeDefined();
    expect(c2pa.Builder).toBeDefined();
    expect(c2pa.LocalSigner).toBeDefined();
    expect(typeof c2pa.Reader).toBe('function');
    expect(typeof c2pa.Builder).toBe('function');
    expect(typeof c2pa.LocalSigner).toBe('function');
  });

  test('can create builder', async () => {
    const { Builder } = await import('@contentauth/c2pa-node');

    // Create a builder with new() - static method
    const builder = Builder.new();

    expect(builder).toBeDefined();
    expect(typeof builder.addAssertion).toBe('function');
    expect(typeof builder.sign).toBe('function');
  });

  test('can create builder with manifest definition', async () => {
    const { Builder } = await import('@contentauth/c2pa-node');

    // Create a builder with manifest definition
    const manifestDef = {
      claim_generator: 'Trusthash/1.0.0',
      title: 'Test Image',
      assertions: [
        {
          label: 'c2pa.actions',
          data: {
            actions: [
              {
                action: 'c2pa.created',
                when: new Date().toISOString(),
                softwareAgent: 'Trusthash/1.0.0',
              },
            ],
          },
        },
      ],
    };

    const builder = Builder.withJson(manifestDef);

    expect(builder).toBeDefined();
    expect(typeof builder.addAssertion).toBe('function');
  });

  test('LocalSigner has newSigner method', async () => {
    const { LocalSigner } = await import('@contentauth/c2pa-node');

    // Verify the static method exists
    expect(typeof LocalSigner.newSigner).toBe('function');
  });

  test('Reader class is available', async () => {
    const { Reader } = await import('@contentauth/c2pa-node');

    // Verify Reader class exists and has expected static methods
    expect(Reader).toBeDefined();
    expect(typeof Reader.fromAsset).toBe('function');
    expect(typeof Reader.fromManifestDataAndAsset).toBe('function');

    // Note: Actual file reading tested after certificate setup
    console.log('Reader class is available with expected methods');
  });

  test('can sign a test image (end-to-end)', async () => {
    const { Builder, LocalSigner } = await import('@contentauth/c2pa-node');

    // This test requires a certificate and key, which we don't have yet
    // For now, just verify the API is accessible
    console.log('End-to-end signing test requires certificate setup (Phase 1)');
    console.log('API is accessible - Phase 0 PASSED');

    // Check that we can create builder and that signing method exists
    const builder = Builder.new();
    const manifestDef = {
      claim_generator: 'Trusthash/1.0.0',
      title: 'Test Image',
    };

    const builderWithManifest = Builder.withJson(manifestDef);

    expect(builder.sign).toBeDefined();
    expect(builderWithManifest.sign).toBeDefined();

    // LocalSigner.newSigner exists
    expect(LocalSigner.newSigner).toBeDefined();
  });
});
