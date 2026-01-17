import { describe, expect, it } from 'bun:test';
import {
  binaryStringToFloatArray,
  floatArrayToBinaryString,
  hexToBinaryString,
  binaryStringToHex,
  hammingDistance,
  hammingDistanceFloat,
  formatPHashForDisplay,
  isValidBinaryPHash,
  isValidHexPHash,
  parsePHash,
} from '../src/utils/bit-vector.js';

describe('bit-vector utilities', () => {
  describe('binaryStringToFloatArray', () => {
    it('converts binary string to float array', () => {
      const binary = '0'.repeat(64);
      const floats = binaryStringToFloatArray(binary);
      expect(floats).toHaveLength(64);
      expect(floats.every((f) => f === 0.0)).toBe(true);
    });

    it('converts mixed binary to correct floats', () => {
      const binary = '10101010'.repeat(8);
      const floats = binaryStringToFloatArray(binary);
      expect(floats).toHaveLength(64);
      expect(floats[0]).toBe(1.0);
      expect(floats[1]).toBe(0.0);
      expect(floats[2]).toBe(1.0);
    });

    it('throws on invalid length', () => {
      expect(() => binaryStringToFloatArray('101010')).toThrow();
    });

    it('throws on invalid characters', () => {
      expect(() => binaryStringToFloatArray('2' + '0'.repeat(63))).toThrow();
    });
  });

  describe('floatArrayToBinaryString', () => {
    it('converts float array back to binary', () => {
      const floats = new Array(64).fill(0).map((_, i) => (i % 2 === 0 ? 1.0 : 0.0));
      const binary = floatArrayToBinaryString(floats);
      expect(binary).toHaveLength(64);
      expect(binary.startsWith('1010')).toBe(true);
    });

    it('handles threshold correctly', () => {
      const floats = [0.6, 0.4, 0.5, 0.49, ...new Array(60).fill(0)];
      const binary = floatArrayToBinaryString(floats);
      expect(binary[0]).toBe('1'); // 0.6 >= 0.5
      expect(binary[1]).toBe('0'); // 0.4 < 0.5
      expect(binary[2]).toBe('1'); // 0.5 >= 0.5
      expect(binary[3]).toBe('0'); // 0.49 < 0.5
    });
  });

  describe('hexToBinaryString', () => {
    it('converts hex to binary', () => {
      // 'a' = 1010, '5' = 0101
      const binary = hexToBinaryString('a5a5a5a5a5a5a5a5');
      expect(binary).toHaveLength(64);
      expect(binary.slice(0, 8)).toBe('10100101');
    });

    it('handles 0x prefix', () => {
      const binary = hexToBinaryString('0xa5a5a5a5a5a5a5a5');
      expect(binary).toHaveLength(64);
    });

    it('handles uppercase', () => {
      const binary = hexToBinaryString('A5A5A5A5A5A5A5A5');
      expect(binary).toHaveLength(64);
    });

    it('throws on invalid length', () => {
      expect(() => hexToBinaryString('a5a5')).toThrow();
    });
  });

  describe('binaryStringToHex', () => {
    it('converts binary to hex', () => {
      const binary = '10100101'.repeat(8);
      const hex = binaryStringToHex(binary);
      expect(hex).toBe('a5a5a5a5a5a5a5a5');
    });

    it('roundtrips correctly', () => {
      const original = 'f81bf99ffb803400';
      const binary = hexToBinaryString(original);
      const hex = binaryStringToHex(binary);
      expect(hex).toBe(original);
    });
  });

  describe('hammingDistance', () => {
    it('returns 0 for identical strings', () => {
      const a = '1010101010101010'.repeat(4);
      expect(hammingDistance(a, a)).toBe(0);
    });

    it('counts bit differences correctly', () => {
      const a = '0'.repeat(64);
      const b = '1' + '0'.repeat(63);
      expect(hammingDistance(a, b)).toBe(1);
    });

    it('returns 64 for completely different strings', () => {
      const a = '0'.repeat(64);
      const b = '1'.repeat(64);
      expect(hammingDistance(a, b)).toBe(64);
    });
  });

  describe('hammingDistanceFloat', () => {
    it('returns 0 for identical arrays', () => {
      const a = new Array(64).fill(1.0);
      expect(hammingDistanceFloat(a, a)).toBe(0);
    });

    it('counts differences correctly', () => {
      const a = new Array(64).fill(0);
      const b = [1.0, ...new Array(63).fill(0)];
      expect(hammingDistanceFloat(a, b)).toBe(1);
    });
  });

  describe('formatPHashForDisplay', () => {
    it('formats binary string with spaces', () => {
      const binary = '10101010'.repeat(8);
      const formatted = formatPHashForDisplay(binary);
      expect(formatted).toContain(' ');
      expect(formatted.split(' ')).toHaveLength(8);
    });
  });

  describe('isValidBinaryPHash', () => {
    it('validates correct binary pHash', () => {
      expect(isValidBinaryPHash('0'.repeat(64))).toBe(true);
      expect(isValidBinaryPHash('1'.repeat(64))).toBe(true);
      expect(isValidBinaryPHash('10101010'.repeat(8))).toBe(true);
    });

    it('rejects invalid binary pHash', () => {
      expect(isValidBinaryPHash('0'.repeat(63))).toBe(false);
      expect(isValidBinaryPHash('0'.repeat(65))).toBe(false);
      expect(isValidBinaryPHash('2' + '0'.repeat(63))).toBe(false);
    });
  });

  describe('isValidHexPHash', () => {
    it('validates correct hex pHash', () => {
      expect(isValidHexPHash('a5a5a5a5a5a5a5a5')).toBe(true);
      expect(isValidHexPHash('0000000000000000')).toBe(true);
      expect(isValidHexPHash('ffffffffffffffff')).toBe(true);
      expect(isValidHexPHash('0xf81bf99ffb803400')).toBe(true);
    });

    it('rejects invalid hex pHash', () => {
      expect(isValidHexPHash('a5a5')).toBe(false);
      expect(isValidHexPHash('g5a5a5a5a5a5a5a5')).toBe(false);
    });
  });

  describe('parsePHash', () => {
    it('parses binary pHash', () => {
      const binary = '1'.repeat(64);
      expect(parsePHash(binary)).toBe(binary);
    });

    it('parses hex pHash to binary', () => {
      const hex = 'ffffffffffffffff';
      expect(parsePHash(hex)).toBe('1'.repeat(64));
    });

    it('throws on invalid format', () => {
      expect(() => parsePHash('invalid')).toThrow();
    });
  });
});
