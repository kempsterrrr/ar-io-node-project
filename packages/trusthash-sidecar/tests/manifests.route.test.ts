import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Hono } from 'hono';
import manifests from '../src/routes/manifests.js';

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
  mock.restore();
});

const originalFetch = globalThis.fetch;

describe('manifests route', () => {
  it('returns 501 for returnActiveManifest=true', async () => {
    const app = createApp();
    const response = await app.request(
      '/v1/manifests/urn%3Auuid%3Atest?returnActiveManifest=true'
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(501);
    expect(body.error).toContain('returnActiveManifest not implemented yet');
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
    expect(response.headers.get('location')).toBe('https://repo.example/v1/manifests/urn:uuid:test');
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
});
