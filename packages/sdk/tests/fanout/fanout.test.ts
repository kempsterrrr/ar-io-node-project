import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fanOutDataItem } from '../../src/fanout/fanout.js';
import type { DataItemHeader, GatewayTarget } from '../../src/types.js';

describe('fanOutDataItem', () => {
  const header: DataItemHeader = {
    id: 'test-data-item-id-aaaaaaaaaaaaaaaaaaa',
    owner: 'test-owner-base64url',
    owner_address: 'test-owner-address',
    signature: 'test-signature-base64url',
    data_size: 100,
    tags: [{ name: 'Content-Type', value: 'text/plain' }],
  };

  const gateways: GatewayTarget[] = [
    { url: 'https://gw1.example.com', adminApiKey: 'key1' },
    { url: 'https://gw2.example.com', adminApiKey: 'key2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct headers and body to each gateway', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'Data item(s) queued' }), { status: 200 })
      );

    const results = await fanOutDataItem(header, gateways, { retries: 0 });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ gateway: 'https://gw1.example.com', status: 'success' });
    expect(results[1]).toEqual({ gateway: 'https://gw2.example.com', status: 'success' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://gw1.example.com/ar-io/admin/queue-data-item');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer key1',
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual([header]);
  });

  it('returns error for failed gateways without blocking others', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Data item(s) queued' }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    const results = await fanOutDataItem(header, gateways, { retries: 0 });

    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('error');
    expect(results[1].message).toContain('401');
  });

  it('retries on failure then succeeds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Data item(s) queued' }), { status: 200 })
      );

    const results = await fanOutDataItem(header, [gateways[0]], {
      retries: 1,
      retryDelayMs: 1,
    });

    expect(results[0].status).toBe('success');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns empty array for no gateways', async () => {
    const results = await fanOutDataItem(header, []);
    expect(results).toEqual([]);
  });

  it('handles network errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const results = await fanOutDataItem(header, [gateways[0]], {
      retries: 0,
    });

    expect(results[0].status).toBe('error');
    expect(results[0].message).toBe('Connection refused');
  });
});
