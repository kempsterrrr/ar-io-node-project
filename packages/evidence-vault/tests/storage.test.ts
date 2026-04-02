import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageAdapter } from '../src/storage/memory.js';

describe('MemoryStorageAdapter', () => {
  let adapter: MemoryStorageAdapter;

  beforeEach(() => {
    adapter = new MemoryStorageAdapter();
  });

  it('stores and retrieves data', async () => {
    const data = Buffer.from('test evidence');
    await adapter.store('evidence/001.pdf', data);

    const retrieved = await adapter.retrieve('evidence/001.pdf');
    expect(retrieved).toEqual(data);
  });

  it('stores Uint8Array data', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    await adapter.store('binary-evidence', data);

    const retrieved = await adapter.retrieve('binary-evidence');
    expect(Buffer.from(data)).toEqual(retrieved);
  });

  it('throws on retrieve of non-existent key', async () => {
    await expect(adapter.retrieve('nonexistent')).rejects.toThrow('Key not found');
  });

  it('checks existence', async () => {
    expect(await adapter.exists('key')).toBe(false);
    await adapter.store('key', Buffer.from('data'));
    expect(await adapter.exists('key')).toBe(true);
  });

  it('overwrites existing keys', async () => {
    await adapter.store('key', Buffer.from('v1'));
    await adapter.store('key', Buffer.from('v2'));

    const retrieved = await adapter.retrieve('key');
    expect(retrieved.toString()).toBe('v2');
  });

  it('clears all data', async () => {
    await adapter.store('a', Buffer.from('1'));
    await adapter.store('b', Buffer.from('2'));

    adapter.clear();

    expect(await adapter.exists('a')).toBe(false);
    expect(await adapter.exists('b')).toBe(false);
  });

  it('returns the key from store', async () => {
    const key = await adapter.store('my-key', Buffer.from('data'));
    expect(key).toBe('my-key');
  });
});
