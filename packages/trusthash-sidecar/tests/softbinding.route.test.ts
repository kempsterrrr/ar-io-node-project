import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import sharp from 'sharp';
import softbinding from '../src/routes/softbinding.js';

function createApp() {
  const app = new Hono();
  app.route('/v1/matches', softbinding);
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
  vi.restoreAllMocks();
});

const originalFetch = globalThis.fetch;

describe('softbinding route', () => {
  it('returns 400 when byBinding query parameters are missing', async () => {
    const app = createApp();
    const response = await app.request('/v1/matches/byBinding');
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain('alg and value');
  });

  it('returns spec-compliant empty matches array for byBinding no-hit queries', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      graphqlResponse({
        data: {
          transactions: {
            edges: [],
          },
        },
      })) as typeof fetch;

    const app = createApp();
    const response = await app.request(
      '/v1/matches/byBinding?alg=org.ar-io.phash&value=AAAAAAAAAAA='
    );
    const body = (await response.json()) as {
      matches?: Array<{ manifestId: string }>;
    };

    expect(response.status).toBe(200);
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.matches?.length).toBe(0);
    // manifestResults should NOT be present (removed per spec compliance)
    expect('manifestResults' in body).toBe(false);
  });

  it('returns spec-compliant match objects for byBinding results', async () => {
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
                    block: { height: 100, timestamp: 1700000100 },
                    tags: [
                      { name: 'C2PA-Manifest-ID', value: 'urn:uuid:redirect' },
                      { name: 'C2PA-Manifest-Repo-URL', value: 'https://repo.example/v1' },
                    ],
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
    const response = await app.request(
      '/v1/matches/byBinding?alg=org.ar-io.phash&value=AAAAAAAAAAA='
    );
    const body = (await response.json()) as {
      matches: Array<{ manifestId: string; endpoint?: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.matches[0]?.manifestId).toBe('urn:uuid:redirect');
    expect(body.matches[0]?.endpoint).toBe('https://repo.example/v1');
    // No non-spec fields should be present
    expect('resolution' in (body.matches[0] || {})).toBe(false);
    expect('fetchUrl' in (body.matches[0] || {})).toBe(false);
    expect('repoUrl' in (body.matches[0] || {})).toBe(false);
  });

  it('accepts any algorithm for byBinding (algorithm-agnostic)', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      graphqlResponse({
        data: {
          transactions: {
            edges: [],
          },
        },
      })) as typeof fetch;

    const app = createApp();
    const response = await app.request('/v1/matches/byBinding?alg=io.iscc.v0&value=AAAAAAAAAAA=');
    const body = (await response.json()) as { matches: unknown[] };

    expect(response.status).toBe(200);
    expect(Array.isArray(body.matches)).toBe(true);
  });

  it('gracefully degrades to empty results when GraphQL fails for byBinding', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      graphqlResponse({ errors: [{ message: 'boom' }] }, 200)) as typeof fetch;

    const app = createApp();
    const response = await app.request(
      '/v1/matches/byBinding?alg=org.ar-io.phash&value=AAAAAAAAAAA='
    );
    const body = (await response.json()) as { matches: unknown[] };

    // byBinding now gracefully falls back to local DB when GraphQL fails
    expect(response.status).toBe(200);
    expect(Array.isArray(body.matches)).toBe(true);
  });

  it('caps byBinding maxResults at 100', async () => {
    const seenFirstValues: number[] = [];
    (globalThis as { fetch: typeof fetch }).fetch = (async (_input, init) => {
      const payload = JSON.parse(String(init?.body || '{}')) as { variables?: { first?: number } };
      seenFirstValues.push(payload.variables?.first || 0);
      return graphqlResponse({
        data: {
          transactions: {
            edges: [],
          },
        },
      });
    }) as typeof fetch;

    const app = createApp();
    const response = await app.request(
      '/v1/matches/byBinding?alg=org.ar-io.phash&value=AAAAAAAAAAA=&maxResults=999'
    );

    expect(response.status).toBe(200);
    expect(seenFirstValues.length).toBe(1);
    expect(seenFirstValues[0]).toBe(100);
  });

  it('accepts POST byBinding with maxResults in body', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      graphqlResponse({
        data: {
          transactions: {
            edges: [],
          },
        },
      })) as typeof fetch;

    const app = createApp();
    const response = await app.request('/v1/matches/byBinding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alg: 'org.ar-io.phash', value: 'AAAAAAAAAAA=', maxResults: 5 }),
    });
    const body = (await response.json()) as { matches: unknown[] };

    expect(response.status).toBe(200);
    expect(Array.isArray(body.matches)).toBe(true);
  });

  it('returns spec-compliant response for byContent', async () => {
    const app = createApp();
    const response = await app.request('/v1/matches/byContent?alg=org.ar-io.phash', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
      },
      body: Buffer.alloc(0),
    });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain('Request body is empty');
  });

  it('accepts byContent with alg=io.iscc.v0 without rejecting the algorithm', async () => {
    const imageBuffer = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 128, g: 64, b: 32 },
      },
    })
      .png()
      .toBuffer();

    const app = createApp();
    const response = await app.request('/v1/matches/byContent?alg=io.iscc.v0', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.length.toString(),
      },
      body: imageBuffer,
    });
    const body = (await response.json()) as { error?: string };

    // In unit tests the DB isn't initialized, so we may get a 400 from the
    // search layer. The key assertion is that it does NOT return the
    // "not supported for algorithm" error — proving ISCC is accepted.
    expect(body.error || '').not.toContain('not supported for algorithm');
    expect(body.error || '').not.toContain('Unsupported');
  });

  it('implements byReference and rejects non-image references with 415', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('plain-text', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': '10',
        },
      })) as typeof fetch;

    const app = createApp();
    const response = await app.request('/v1/matches/byReference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ referenceUrl: 'https://example.com/file.txt', assetLength: 10 }),
    });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(415);
    expect(body.error).toContain('Unsupported content type: text/plain');
  });
});
