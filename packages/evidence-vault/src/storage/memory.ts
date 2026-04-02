import type { StorageAdapter } from '../types.js';

/**
 * In-memory storage adapter for testing and development.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private data = new Map<string, Buffer>();

  async retrieve(key: string): Promise<Buffer> {
    const buf = this.data.get(key);
    if (!buf) {
      throw new Error(`Key not found: ${key}`);
    }
    return buf;
  }

  async store(key: string, data: Buffer | Uint8Array): Promise<string> {
    this.data.set(key, Buffer.isBuffer(data) ? data : Buffer.from(data));
    return key;
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  /** Clear all stored data (for test cleanup). */
  clear(): void {
    this.data.clear();
  }
}
