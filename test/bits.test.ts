import { describe, expect, it } from 'vitest';
import { GENESIS_BITS, bitsToTarget, hashToBigInt, isValidBits, targetToBits } from '../src/core/bits.js';

describe('nBits compact target', () => {
  it('round-trips genesis bits 0x20ffffff', () => {
    const target = bitsToTarget(GENESIS_BITS);
    expect(targetToBits(target)).toBe(GENESIS_BITS);
    expect(target).toBe(0xffffffn << 232n);
  });

  it('treats 0x1d00ffff and 0x1cffff00 as the same target (unsigned, no sign bit)', () => {
    const a = bitsToTarget(0x1d00ffff);
    const b = bitsToTarget(0x1cffff00);
    expect(a).toBe(b);
    expect(targetToBits(a)).toBe(0x1cffff00);
  });

  it('encodes target 1 and accepts equivalent compact forms', () => {
    const canonical = targetToBits(1n);
    expect(bitsToTarget(canonical)).toBe(1n);
    expect(bitsToTarget(0x03000001)).toBe(1n);
    expect(targetToBits(bitsToTarget(0x03000001))).toBe(canonical);
  });

  it('encodes a 3-byte target without shifting', () => {
    expect(bitsToTarget(0x03ffffff)).toBe(0xffffffn);
    expect(targetToBits(0xffffffn)).toBe(0x03ffffff);
  });

  it('round-trips 2^255', () => {
    const target = 1n << 255n;
    expect(bitsToTarget(targetToBits(target))).toBe(target);
  });

  it('rejects out-of-range bits and zero mantissa', () => {
    expect(() => bitsToTarget(-1)).toThrow(RangeError);
    expect(() => bitsToTarget(0x1_0000_0000)).toThrow(RangeError);
    expect(bitsToTarget(0)).toBe(0n);
    expect(isValidBits(0)).toBe(false);
    expect(isValidBits(GENESIS_BITS)).toBe(true);
    expect(isValidBits(0x03000001)).toBe(true);
  });

  it('parses a 32-byte hash as an unsigned 256-bit integer', () => {
    expect(hashToBigInt('00'.repeat(32))).toBe(0n);
    expect(hashToBigInt('ff'.repeat(32))).toBe((1n << 256n) - 1n);
    expect(() => hashToBigInt('abc')).toThrow(RangeError);
  });
});
