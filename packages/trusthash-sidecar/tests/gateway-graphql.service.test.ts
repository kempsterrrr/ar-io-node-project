import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  GatewayGraphQLError,
  lookupBySoftBinding,
  lookupManifestLocatorById,
} from '../src/services/gateway-graphql.service.js';

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

describe('gateway-graphql.service', () => {
  it('resolves exact byBinding matches across both tag naming families', async () => {
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
                    id: 'tx-b',
                    block: { height: 10, timestamp: 1700000010 },
                    tags: [
                      { name: 'C2PA-Manifest-ID', value: 'urn:uuid:b' },
                      { name: 'C2PA-Manifest-Repo-URL', value: 'https://repo.example/v1' },
                    ],
                  },
                },
                {
                  node: {
                    id: 'tx-a',
                    block: { height: 12, timestamp: 1700000012 },
                    tags: [
                      { name: 'C2PA-Manifest-ID', value: 'urn:uuid:a' },
                      { name: 'C2PA-Manifest-Fetch-URL', value: 'https://repo.example/v1/manifests/a' },
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
            edges: [
              {
                node: {
                  id: 'tx-a',
                  block: { height: 12, timestamp: 1700000012 },
                  tags: [
                    { name: 'C2PA-Manifest-Id', value: 'urn:uuid:a' },
                    { name: 'C2PA-Manifest-Repo-URL', value: 'https://repo.example/v1' },
                    { name: 'C2PA-Manifest-Fetch-URL', value: 'https://repo.example/v1/manifests/a' },
                  ],
                },
              },
            ],
          },
        },
      });
    }) as typeof fetch;

    const results = await lookupBySoftBinding({
      alg: 'org.ar-io.phash',
      valueB64: 'AAAAAAAAAAA=',
      maxResults: 10,
    });

    expect(results.length).toBe(2);
    expect(results[0].manifestId).toBe('urn:uuid:a');
    expect(results[1].manifestId).toBe('urn:uuid:b');
    expect(results[0].fetchUrl).toBe('https://repo.example/v1/manifests/a');
  });

  it('returns empty list when no exact tags match', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      graphqlResponse({
        data: {
          transactions: {
            edges: [],
          },
        },
      })
    ) as typeof fetch;

    const results = await lookupBySoftBinding({
      alg: 'org.ar-io.phash',
      valueB64: 'AAAAAAAAAAA=',
      maxResults: 5,
    });

    expect(results).toEqual([]);
  });

  it('throws GatewayGraphQLError when upstream GraphQL fails', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      graphqlResponse({ error: 'bad' }, 500)) as typeof fetch;

    await expect(
      lookupBySoftBinding({
        alg: 'org.ar-io.phash',
        valueB64: 'AAAAAAAAAAA=',
      })
    ).rejects.toBeInstanceOf(GatewayGraphQLError);
  });

  it('resolves latest manifest locator by manifest ID', async () => {
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
                    block: { height: 30, timestamp: 1700000030 },
                    tags: [
                      { name: 'C2PA-Manifest-ID', value: 'urn:uuid:test' },
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
            edges: [
              {
                node: {
                  id: 'tx-2',
                  block: { height: 31, timestamp: 1700000031 },
                  tags: [
                    { name: 'C2PA-Manifest-Id', value: 'urn:uuid:test' },
                    {
                      name: 'C2PA-Manifest-Fetch-URL',
                      value: 'https://repo.example/v1/manifests/urn:uuid:test',
                    },
                  ],
                },
              },
            ],
          },
        },
      });
    }) as typeof fetch;

    const locator = await lookupManifestLocatorById('urn:uuid:test');

    expect(locator).not.toBeNull();
    expect(locator?.manifestTxId).toBe('tx-2');
    expect(locator?.manifestId).toBe('urn:uuid:test');
    expect(locator?.fetchUrl).toBe('https://repo.example/v1/manifests/urn:uuid:test');
  });
});
