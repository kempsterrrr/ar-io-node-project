import { describe, expect, it } from 'bun:test';
import { detectContentType, SUPPORTED_CONTENT_TYPES } from '../src/detect.js';

describe('detectContentType', () => {
  it('detects JPEG from magic bytes', () => {
    const buf = new Uint8Array(12);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    expect(detectContentType(buf)).toBe('image/jpeg');
  });

  it('detects PNG from magic bytes', () => {
    const buf = new Uint8Array(12);
    buf[0] = 0x89;
    buf[1] = 0x50;
    buf[2] = 0x4e;
    buf[3] = 0x47;
    expect(detectContentType(buf)).toBe('image/png');
  });

  it('detects GIF from magic bytes', () => {
    const buf = new Uint8Array(12);
    buf[0] = 0x47;
    buf[1] = 0x49;
    buf[2] = 0x46;
    expect(detectContentType(buf)).toBe('image/gif');
  });

  it('detects WebP from magic bytes', () => {
    // RIFF....WEBP
    const buf = new Uint8Array(12);
    buf[0] = 0x52;
    buf[1] = 0x49;
    buf[2] = 0x46;
    buf[3] = 0x46;
    buf[8] = 0x57;
    buf[9] = 0x45;
    buf[10] = 0x42;
    buf[11] = 0x50;
    expect(detectContentType(buf)).toBe('image/webp');
  });

  it('detects PDF from magic bytes', () => {
    const buf = new Uint8Array(12);
    buf[0] = 0x25;
    buf[1] = 0x50;
    buf[2] = 0x44;
    buf[3] = 0x46;
    expect(detectContentType(buf)).toBe('application/pdf');
  });

  it('returns null for unknown format', () => {
    const buf = new Uint8Array(12).fill(0x00);
    expect(detectContentType(buf)).toBeNull();
  });

  it('returns null for buffer too short', () => {
    const buf = new Uint8Array(4);
    expect(detectContentType(buf)).toBeNull();
  });

  it('exports supported content types', () => {
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/jpeg');
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/png');
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/webp');
    expect(SUPPORTED_CONTENT_TYPES.length).toBeGreaterThanOrEqual(7);
  });
});
