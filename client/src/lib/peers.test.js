import { describe, expect, it } from 'vitest';
import { normalizePeerCode } from './peers';

describe('normalizePeerCode', () => {
  it('uppercases and trims', () => {
    expect(normalizePeerCode('  peer-k7m2qx ')).toBe('PEER-K7M2QX');
  });
  it('adds the PEER- prefix when it is missing', () => {
    expect(normalizePeerCode('k7m2qx')).toBe('PEER-K7M2QX');
  });
  it('returns an empty string for blank input', () => {
    expect(normalizePeerCode('   ')).toBe('');
    expect(normalizePeerCode(undefined)).toBe('');
  });
});
