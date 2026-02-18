import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Hono } from 'hono';
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
  mock.restore();
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

  it('returns empty arrays for byBinding no-hit queries', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      graphqlResponse({
        data: {
          transactions: {
            edges: [],
          },
        },
      })
    ) as typeof fetch;

    const app = createApp();
    const response = await app.request('/v1/matches/byBinding?alg=org.ar-io.phash&value=AAAAAAAAAAA=');
    const body = (await response.json()) as {
      matches?: unknown[];
      manifestResults?: unknown[];
    };

    expect(response.status).toBe(200);
    expect(Array.isArray(body.matches)).toBe(true);
    expect(Array.isArray(body.manifestResults)).toBe(true);
    expect(body.matches?.length).toBe(0);
    expect(body.manifestResults?.length).toBe(0);
  });

  it('maps upstream GraphQL failures to 502 for byBinding', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      graphqlResponse({ errors: [{ message: 'boom' }] }, 200)) as typeof fetch;

    const app = createApp();
    const response = await app.request('/v1/matches/byBinding?alg=org.ar-io.phash&value=AAAAAAAAAAA=');
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(body.error).toContain('Gateway GraphQL');
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
    expect(seenFirstValues.length).toBe(2);
    expect(seenFirstValues[0]).toBe(100);
    expect(seenFirstValues[1]).toBe(100);
  });

  it('returns 501 for byReference', async () => {
    const app = createApp();
    const response = await app.request('/v1/matches/byReference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ referenceUrl: 'https://example.com/image.png', assetLength: 100 }),
    });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(501);
    expect(body.error).toContain('byReference not implemented yet');
  });
});
