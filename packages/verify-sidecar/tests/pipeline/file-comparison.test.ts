import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { compareFiles } from '../../src/pipeline/file-comparison.js';

vi.mock('../../src/config.js', () => ({
  config: {
    GATEWAY_URL: 'http://localhost:4000',
    GATEWAY_TIMEOUT_MS: 5000,
    PORT: 4001,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SQLITE_PATH: ':memory:',
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function computeDigest(data: Buffer): string {
  const hash = createHash('sha256').update(data).digest();
  const b64url = hash.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `sha256-b64:${b64url}`;
}

describe('compareFiles', () => {
  it('returns empty array when no files provided', () => {
    const result = compareFiles([], 'sha256-b64:abc', 'full');
    expect(result).toEqual([]);
  });

  it('returns match when file hash matches on-chain digest', () => {
    const fileData = Buffer.from('hello world');
    const digest = computeDigest(fileData);

    const result = compareFiles([{ originalname: 'test.txt', buffer: fileData }], digest, 'full');

    expect(result).toHaveLength(1);
    expect(result[0].match).toBe(true);
    expect(result[0].filename).toBe('test.txt');
    expect(result[0].fileHash).toBe(digest);
    expect(result[0].onChainHash).toBe(digest);
  });

  it('returns mismatch when file hash differs from on-chain digest', () => {
    const fileData = Buffer.from('different data');
    const result = compareFiles(
      [{ originalname: 'report.pdf', buffer: fileData }],
      'sha256-b64:SomeOtherHash',
      'full'
    );

    expect(result).toHaveLength(1);
    expect(result[0].match).toBe(false);
    expect(result[0].filename).toBe('report.pdf');
    expect(result[0].onChainHash).toBe('sha256-b64:SomeOtherHash');
  });

  it('skips comparison for Tier 2 (basic) results', () => {
    const fileData = Buffer.from('test');
    const result = compareFiles([{ originalname: 'test.txt', buffer: fileData }], null, 'basic');

    expect(result).toHaveLength(1);
    expect(result[0].match).toBe(false);
    expect(result[0].onChainHash).toBe('unavailable');
  });

  it('handles multiple files', () => {
    const file1 = Buffer.from('file one');
    const file2 = Buffer.from('file two');
    const digest = computeDigest(file1);

    const result = compareFiles(
      [
        { originalname: 'match.txt', buffer: file1 },
        { originalname: 'nomatch.txt', buffer: file2 },
      ],
      digest,
      'full'
    );

    expect(result).toHaveLength(2);
    expect(result[0].match).toBe(true);
    expect(result[1].match).toBe(false);
  });
});
