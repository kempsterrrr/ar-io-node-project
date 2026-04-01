import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeResolve } from '../../src/operations/resolve.js';
import { GatewayClient } from '../../src/clients/gateway.js';

describe('executeResolve', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let gateway: GatewayClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    gateway = new GatewayClient('http://localhost:3000', 15000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves an ArNS name to a transaction ID', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ txId: 'resolved-tx-abc' }),
    });

    const result = await executeResolve(gateway, 'my-data');
    expect(result.txId).toBe('resolved-tx-abc');
  });

  it('strips .ar-io.dev suffix from name', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ txId: 'tx-from-domain' }),
    });

    await executeResolve(gateway, 'my-data.ar-io.dev');

    // Should call resolver with stripped name
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/ar-io/resolver/my-data',
      expect.any(Object)
    );
  });

  it('throws when name cannot be resolved', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(executeResolve(gateway, 'nonexistent')).rejects.toThrow('could not be resolved');
  });
});
