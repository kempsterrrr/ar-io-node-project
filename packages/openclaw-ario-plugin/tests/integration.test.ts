/**
 * OpenClaw AR.IO Gateway Plugin Integration Tests
 *
 * Tests the gateway client directly against the mock server.
 * These tests verify that the plugin correctly interacts with AR.IO gateway APIs.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

// Test data matching mock-server.js
const TEST_TX_ID = '4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM';
const TEST_ARNS_NAME = 'ardrive';

describe('AR.IO Gateway Integration', () => {
  beforeAll(async () => {
    // Wait for gateway to be ready
    const maxRetries = 10;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${GATEWAY_URL}/ar-io/info`);
        if (response.ok) {
          console.log('Gateway is ready');
          return;
        }
      } catch {
        console.log(`Waiting for gateway... (${i + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Gateway not ready after timeout');
  });

  describe('gateway_info', () => {
    it('should return gateway information', async () => {
      const response = await fetch(`${GATEWAY_URL}/ar-io/info`);
      expect(response.ok).toBe(true);

      const info = await response.json();
      expect(info).toHaveProperty('network');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('height');
      expect(typeof info.height).toBe('number');
    });
  });

  describe('gateway_fetch', () => {
    it('should fetch transaction metadata', async () => {
      const response = await fetch(`${GATEWAY_URL}/tx/${TEST_TX_ID}`);
      expect(response.ok).toBe(true);

      const tx = await response.json();
      expect(tx).toHaveProperty('id');
      expect(tx).toHaveProperty('owner');
    });

    it('should fetch transaction tags', async () => {
      const response = await fetch(`${GATEWAY_URL}/tx/${TEST_TX_ID}/tags`);
      expect(response.ok).toBe(true);

      const tags = await response.json();
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags[0]).toHaveProperty('name');
      expect(tags[0]).toHaveProperty('value');
    });

    it('should fetch transaction data', async () => {
      const response = await fetch(`${GATEWAY_URL}/${TEST_TX_ID}`);
      expect(response.ok).toBe(true);

      const data = await response.text();
      expect(data).toBe('test');
    });

    it('should return 404 for unknown transaction', async () => {
      const response = await fetch(`${GATEWAY_URL}/tx/unknown-tx-id`);
      expect(response.status).toBe(404);
    });
  });

  describe('gateway_resolve', () => {
    it('should resolve known ArNS name', async () => {
      const response = await fetch(`${GATEWAY_URL}/ar-io/resolver/records/${TEST_ARNS_NAME}`);
      expect(response.ok).toBe(true);

      const resolution = await response.json();
      expect(resolution).toHaveProperty('txId');
      expect(resolution).toHaveProperty('ttlSeconds');
      expect(typeof resolution.txId).toBe('string');
    });

    it('should return 404 for unknown ArNS name', async () => {
      const response = await fetch(`${GATEWAY_URL}/ar-io/resolver/records/nonexistent-name`);
      expect(response.status).toBe(404);
    });
  });

  describe('gateway_search', () => {
    it('should search transactions via GraphQL', async () => {
      const query = `
        query {
          transactions(tags: [{ name: "App-Name", values: ["ArDrive"] }], first: 10) {
            edges {
              node {
                id
                owner { address }
                tags { name value }
                data { size }
              }
            }
          }
        }
      `;

      const response = await fetch(`${GATEWAY_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      expect(response.ok).toBe(true);

      const result = await response.json();
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('transactions');
      expect(result.data.transactions).toHaveProperty('edges');
      expect(Array.isArray(result.data.transactions.edges)).toBe(true);
      expect(result.data.transactions.edges.length).toBeGreaterThan(0);

      const firstTx = result.data.transactions.edges[0].node;
      expect(firstTx).toHaveProperty('id');
      expect(firstTx).toHaveProperty('owner');
      expect(firstTx).toHaveProperty('tags');
    });
  });

  describe('error handling', () => {
    it('should handle invalid endpoints gracefully', async () => {
      const response = await fetch(`${GATEWAY_URL}/invalid/endpoint`);
      expect(response.status).toBe(404);
    });
  });
});
