/**
 * Mock AR.IO Gateway Server for Integration Tests
 *
 * Simulates the AR.IO gateway API endpoints used by the OpenClaw plugin.
 */

const http = require('http');

// Known test transaction ID
const TEST_TX_ID = '4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM';

// Mock data
const mockGatewayInfo = {
  network: 'arweave.N.1',
  version: '1.0.0-test',
  release: '1',
  height: 1500000,
  current: 'test-block-hash',
  blocks: 1500000,
  peers: 10,
  queue_length: 0,
  node_state_latency: 0,
};

const mockTransaction = {
  id: TEST_TX_ID,
  owner: 'test-owner-address-123',
  data_size: '4',
};

const mockTransactionTags = [
  { name: 'Content-Type', value: 'text/plain' },
  { name: 'App-Name', value: 'TestApp' },
];

const mockArNSRecord = {
  txId: 'ardrive-tx-id-123',
  ttlSeconds: 3600,
};

const mockGraphQLResponse = {
  data: {
    transactions: {
      edges: [
        {
          node: {
            id: 'search-result-tx-1',
            owner: { address: 'owner-1' },
            tags: [
              { name: 'App-Name', value: 'ArDrive' },
              { name: 'Content-Type', value: 'image/png' },
            ],
            data: { size: '1024' },
          },
        },
        {
          node: {
            id: 'search-result-tx-2',
            owner: { address: 'owner-2' },
            tags: [
              { name: 'App-Name', value: 'ArDrive' },
              { name: 'Content-Type', value: 'application/json' },
            ],
            data: { size: '512' },
          },
        },
      ],
    },
  },
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  console.log(`[Mock Gateway] ${req.method} ${path}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Route handling
  try {
    // Gateway info
    if (path === '/ar-io/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockGatewayInfo));
      return;
    }

    // ArNS resolution
    if (path.startsWith('/ar-io/resolver/records/')) {
      const name = path.split('/').pop();
      if (name === 'ardrive') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockArNSRecord));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ArNS name not found' }));
      }
      return;
    }

    // Transaction metadata
    if (path.startsWith('/tx/') && path.endsWith('/tags')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockTransactionTags));
      return;
    }

    // Transaction info
    if (path.startsWith('/tx/')) {
      const txId = path.split('/')[2];
      if (txId === TEST_TX_ID) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockTransaction));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Transaction not found' }));
      }
      return;
    }

    // Transaction data
    if (path === `/${TEST_TX_ID}`) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('test');
      return;
    }

    // GraphQL endpoint
    if (path === '/graphql' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockGraphQLResponse));
      });
      return;
    }

    // Health check
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error('[Mock Gateway] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Mock Gateway] Listening on port ${PORT}`);
});
