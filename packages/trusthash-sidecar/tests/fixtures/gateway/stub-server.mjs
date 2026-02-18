import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.env.PORT || 80);
const fixturesDir = process.env.GATEWAY_FIXTURES_DIR || '/fixtures';

const manifestTxId = process.env.GATEWAY_STUB_MANIFEST_TX_ID || 'test-tx-0001';
const manifestId =
  process.env.GATEWAY_STUB_MANIFEST_ID || 'urn:uuid:00000000-0000-0000-0000-000000000000';
const softBindingAlg = process.env.GATEWAY_STUB_SOFT_BINDING_ALG || 'org.ar-io.phash';
const softBindingValue = process.env.GATEWAY_STUB_SOFT_BINDING_VALUE || 'AAAAAAAAAAA=';
const repoUrl = process.env.GATEWAY_STUB_REPO_URL || 'http://gateway-stub/v1';
const fetchUrl = process.env.GATEWAY_STUB_FETCH_URL || `http://gateway-stub/${manifestTxId}`;
const protocolTagValue = process.env.GATEWAY_STUB_PROTOCOL || 'C2PA-Manifest-Proof';

const graphqlTransactions = [
  {
    id: manifestTxId,
    tags: [
      { name: 'Protocol', value: protocolTagValue },
      { name: 'C2PA-Manifest-ID', value: manifestId },
      { name: 'C2PA-Manifest-Id', value: manifestId },
      { name: 'C2PA-Soft-Binding-Alg', value: softBindingAlg },
      { name: 'C2PA-Soft-Binding-Value', value: softBindingValue },
      { name: 'C2PA-SoftBinding-Alg', value: softBindingAlg },
      { name: 'C2PA-SoftBinding-Value', value: softBindingValue },
      { name: 'C2PA-Manifest-Repo-URL', value: repoUrl },
      { name: 'C2PA-Manifest-Fetch-URL', value: fetchUrl },
    ],
    block: {
      height: 42,
      timestamp: 1700000000,
    },
  },
];

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload).toString(),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function hasTagMatch(tags = [], filter) {
  const filterName = String(filter?.name || '').toLowerCase();
  const values = Array.isArray(filter?.values) ? filter.values.map(String) : [];
  if (!filterName || values.length === 0) {
    return false;
  }
  return tags.some((tag) => tag.name.toLowerCase() === filterName && values.includes(tag.value));
}

function handleGraphql(req, res) {
  readBody(req)
    .then((bodyRaw) => {
      let payload;
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        sendJson(res, 400, { errors: [{ message: 'Invalid JSON body' }] });
        return;
      }

      const variables = payload?.variables || {};
      const tagFilters = Array.isArray(variables.tags) ? variables.tags : [];
      const first = Number(variables.first) || 10;

      const filtered = graphqlTransactions.filter((tx) =>
        tagFilters.every((filter) => hasTagMatch(tx.tags, filter))
      );
      const limited = filtered.slice(0, Math.max(0, first));

      sendJson(res, 200, {
        data: {
          transactions: {
            edges: limited.map((node) => ({ node })),
          },
        },
      });
    })
    .catch((error) => {
      sendJson(res, 500, {
        errors: [{ message: `Stub failure: ${error?.message || 'unknown'}` }],
      });
    });
}

function serveFixture(pathname, res) {
  const safePath = pathname.replace(/^\/+/, '');
  const fullPath = join(fixturesDir, safePath);
  if (!existsSync(fullPath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const content = readFileSync(fullPath);
  const contentType = safePath.endsWith('.png')
    ? 'image/png'
    : safePath.endsWith('.json')
      ? 'application/json'
      : 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
  });
  res.end(content);
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (req.method === 'POST' && url.pathname === '/graphql') {
    return handleGraphql(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/') {
    return sendJson(res, 200, { service: 'gateway-stub', graphql: '/graphql' });
  }

  if (req.method === 'GET') {
    return serveFixture(url.pathname, res);
  }

  res.writeHead(405);
  res.end('Method not allowed');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Gateway stub listening on ${port}`);
});
