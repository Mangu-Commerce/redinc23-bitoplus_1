import { describe, expect, it } from 'vitest';
import { parseMoney } from './parseMoney';

describe('parseMoney', () => {
  it('parses standard money values', () => {
    expect(parseMoney('$1,234.56')).toBe(1234.56);
  });
  
  it('keeps zero as zero', () => {
    expect(parseMoney('0.00')).toBe(0);
  });
  
  it('returns null for missing-style values', () => {
    expect(parseMoney('N/A')).toBeNull();
    expect(parseMoney('--')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });
  
  it('returns null for invalid input', () => {
    expect(parseMoney('abc')).toBeNull();
  });
});
