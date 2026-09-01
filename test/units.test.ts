import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, ORBS_PER_SPH } from '../src/types.js';
import { assertOrbsFitSafeInteger, maxSupplyOrbs, parseSphToOrbs } from '../src/core/units.js';

describe('integer Orbs', () => {
  it('parses SPH decimals to whole Orbs', () => {
    expect(parseSphToOrbs('50')).toBe(50 * ORBS_PER_SPH);
    expect(parseSphToOrbs('0.00000001')).toBe(1);
    expect(() => parseSphToOrbs('1.000000001')).toThrow(/Invalid SPH/);
    expect(() => parseSphToOrbs('1e8')).toThrow(/Invalid SPH/);
  });

  it('keeps the 21M cap inside Number.MAX_SAFE_INTEGER with headroom', () => {
    const cap = maxSupplyOrbs(DEFAULT_CONFIG.initialRewardOrbs, DEFAULT_CONFIG.halvingInterval);
    assertOrbsFitSafeInteger(DEFAULT_CONFIG.initialRewardOrbs, DEFAULT_CONFIG.halvingInterval);
    expect(Number.isSafeInteger(cap)).toBe(true);
    expect(cap).toBe(2_099_999_997_690_000);
    expect(Number.MAX_SAFE_INTEGER - cap).toBe(6_907_199_257_050_991);
  });
});
