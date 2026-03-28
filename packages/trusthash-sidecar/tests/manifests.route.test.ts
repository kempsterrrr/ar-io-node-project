import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import manifests from '../src/routes/manifests.js';
import { clearRemoteManifestCache } from '../src/services/remote-manifest.service.js';

function createApp() {
  const app = new Hono();
  app.route('/v1/manifests', manifests);
  return app;
}

function graphqlResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  clearRemoteManifestCache();
  vi.restoreAllMocks();
});

const originalFetch = globalThis.fetch;

describe('manifests route', () => {
  it('returns 400 for invalid returnActiveManifest value', async () => {
    const app = createApp();
    const response = await app.request(
      '/v1/manifests/urn%3Auuid%3Atest?returnActiveManifest=maybe'
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain('returnActiveManifest must be true or false');
  });

  it('redirects to fetch URL when manifest fetch tag exists', async () => {
    let callCount = 0;
    (globalThis as { fetch: typeof fetch }).fetch = (async () => {
      callCount += 1;
      if (callCount === 1) {
        return graphqlResponse({
          data: {
            transactions: {
              edges: [
                {
                  node: {
                    id: 'tx-1',
                    tags: [
                      { name: 'C2PA-Manifest-ID', value: 'urn:uuid:test' },
                      {
                        name: 'C2PA-Manifest-Fetch-URL',
                        value: 'https://repo.example/v1/manifests/urn:uuid:test',
                      },
                    ],
                    block: { height: 10, timestamp: 1700000010 },
                  },
                },
              ],
            },
          },
        });
      }

      return graphqlResponse({
        data: {
          transactions: {
            edges: [],
          },
        },
      });
    }) as typeof fetch;

    const app = createApp();
    const response = await app.request('/v1/manifests/urn%3Auuid%3Atest', {
      method: 'GET',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://repo.example/v1/manifests/urn:uuid:test'
    );
    expect(response.headers.get('x-manifest-resolution')).toBe('fetch-url');
  });

  it('redirects to repo URL when only repo tag exists', async () => {
    let callCount = 0;
    (globalThis as { fetch: typeof fetch }).fetch = (async () => {
      callCount += 1;
      if (callCount === 1) {
        return graphqlResponse({
          data: {
            transactions: {
              edges: [
                {
                  node: {
                    id: 'tx-2',
                    tags: [
                      { name: 'C2PA-Manifest-ID', value: 'urn:uuid:test2' },
                      { name: 'C2PA-Manifest-Repo-URL', value: 'https://repo.example/v1' },
                    ],
                    block: { height: 11, timestamp: 1700000011 },
                  },
                },
              ],
            },
          },
        });
      }

      return graphqlResponse({
        data: {
          transactions: {
            edges: [],
          },
        },
      });
    }) as typeof fetch;

    const app = createApp();
    const response = await app.request('/v1/manifests/urn%3Auuid%3Atest2', {
      method: 'GET',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://repo.example/v1/manifests/urn%3Auuid%3Atest2'
    );
    expect(response.headers.get('x-manifest-resolution')).toBe('repo-url');
  });

  it('fetches proof-locator manifests and reuses ephemeral cache', async () => {
    const manifestBytes = Buffer.from('C2PA_PROOF_MANIFEST_BYTES');
    const digestB64 = createHash('sha256').update(manifestBytes).digest('base64');
    let remoteFetchCalls = 0;

    (globalThis as { fetch: typeof fetch }).fetch = (async (input, init) => {
      const url = String(input);
      if (url.includes('/graphql')) {
        return graphqlResponse({
          data: {
            transactions: {
              edges: [
                {
                  node: {
                    id: 'proof-tx-1',
                    tags: [
                      { name: 'C2PA-Manifest-ID', value: 'urn:uuid:proof-1' },
                      { name: 'C2PA-Storage-Mode', value: 'proof' },
                      {
                        name: 'C2PA-Manifest-Fetch-URL',
                        value: 'https://proof.example/manifest.c2pa',
                      },
                      { name: 'C2PA-Manifest-Store-Hash', value: digestB64 },
                    ],
                    block: { height: 22, timestamp: 1700000022 },
                  },
                },
              ],
            },
          },
        });
      }

      if (url === 'https://proof.example/manifest.c2pa') {
        remoteFetchCalls += 1;
        return new Response(manifestBytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/c2pa',
            'Content-Length': String(manifestBytes.length),
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url} body=${String(init?.body || '')}`);
    }) as typeof fetch;

    const app = createApp();

    const first = await app.request('/v1/manifests/urn%3Auuid%3Aproof-1');
    const firstBody = await first.text();

    expect(first.status).toBe(200);
    expect(firstBody).toBe('C2PA_PROOF_MANIFEST_BYTES');
    expect(first.headers.get('x-manifest-resolution')).toBe('proof-remote-fetch');

    const second = await app.request('/v1/manifests/urn%3Auuid%3Aproof-1');
    const secondBody = await second.text();

    expect(second.status).toBe(200);
    expect(secondBody).toBe('C2PA_PROOF_MANIFEST_BYTES');
    expect(second.headers.get('x-manifest-resolution')).toBe('proof-remote-cache');
    expect(remoteFetchCalls).toBe(1);
  });

  it('returns 502 when proof-locator digest verification fails', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async (input) => {
      const url = String(input);
      if (url.includes('/graphql')) {
        return graphqlResponse({
          data: {
            transactions: {
              edges: [
                {
                  node: {
                    id: 'proof-tx-2',
                    tags: [
                      { name: 'C2PA-Manifest-ID', value: 'urn:uuid:proof-2' },
                      { name: 'C2PA-Storage-Mode', value: 'proof' },
                      {
                        name: 'C2PA-Manifest-Fetch-URL',
                        value: 'https://proof.example/manifest.c2pa',
                      },
                      {
                        name: 'C2PA-Manifest-Store-Hash',
                        value: Buffer.from('bad').toString('base64'),
                      },
                    ],
                    block: { height: 23, timestamp: 1700000023 },
                  },
                },
              ],
            },
          },
        });
      }

      return new Response('C2PA_MANIFEST_BYTES', {
        status: 200,
        headers: { 'Content-Type': 'application/c2pa' },
      });
    }) as typeof fetch;

    const app = createApp();
    const response = await app.request('/v1/manifests/urn%3Auuid%3Aproof-2');
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(body.error).toContain('digest verification failed');
  });
});
