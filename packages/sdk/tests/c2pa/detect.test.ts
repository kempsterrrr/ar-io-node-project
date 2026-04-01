import { describe, it, expect } from 'vitest';
import { detectContentType, SUPPORTED_CONTENT_TYPES } from '../../src/c2pa/detect.js';

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

  it('detects TIFF (little-endian) from magic bytes', () => {
    const buf = new Uint8Array(12);
    buf[0] = 0x49;
    buf[1] = 0x49;
    buf[2] = 0x2a;
    buf[3] = 0x00;
    expect(detectContentType(buf)).toBe('image/tiff');
  });

  it('detects TIFF (big-endian) from magic bytes', () => {
    const buf = new Uint8Array(12);
    buf[0] = 0x4d;
    buf[1] = 0x4d;
    buf[2] = 0x00;
    buf[3] = 0x2a;
    expect(detectContentType(buf)).toBe('image/tiff');
  });

  it('detects AVIF from magic bytes', () => {
    const buf = new Uint8Array(12);
    buf[4] = 0x66;
    buf[5] = 0x74;
    buf[6] = 0x79;
    buf[7] = 0x70;
    buf[8] = 0x61;
    buf[9] = 0x76;
    buf[10] = 0x69;
    buf[11] = 0x66;
    expect(detectContentType(buf)).toBe('image/avif');
  });

  it('detects HEIF from magic bytes', () => {
    const buf = new Uint8Array(12);
    buf[4] = 0x66;
    buf[5] = 0x74;
    buf[6] = 0x79;
    buf[7] = 0x70;
    buf[8] = 0x68;
    buf[9] = 0x65;
    buf[10] = 0x69;
    buf[11] = 0x63;
    expect(detectContentType(buf)).toBe('image/heif');
  });

  it('detects PDF from magic bytes', () => {
    const buf = new Uint8Array(12);
    buf[0] = 0x25;
    buf[1] = 0x50;
    buf[2] = 0x44;
    buf[3] = 0x46;
    expect(detectContentType(buf)).toBe('application/pdf');
  });

  it('returns null for unrecognized format', () => {
    const buf = new Uint8Array(12).fill(0x00);
    expect(detectContentType(buf)).toBeNull();
  });

  it('returns null for buffer shorter than 12 bytes', () => {
    const buf = new Uint8Array(5);
    expect(detectContentType(buf)).toBeNull();
  });

  it('SUPPORTED_CONTENT_TYPES includes all formats', () => {
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/jpeg');
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/png');
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/gif');
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/webp');
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/tiff');
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/avif');
    expect(SUPPORTED_CONTENT_TYPES).toContain('image/heif');
    expect(SUPPORTED_CONTENT_TYPES).toContain('application/pdf');
    expect(SUPPORTED_CONTENT_TYPES).toHaveLength(8);
  });
});
