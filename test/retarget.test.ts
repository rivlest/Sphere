import { describe, expect, it } from 'vitest';
import {
  GENESIS_BITS,
  bitsToTarget,
  easeTarget,
  retargetTarget,
  targetToBits,
} from '../src/core/bits.js';
import { STALL_FACTOR, computeNextBits, retargetTowardTimespan } from '../src/core/retarget.js';
import { DEFAULT_CONFIG, type Block } from '../src/types.js';

function headerBlock(index: number, bits: number, timestamp = 1): Block {
  return {
    header: {
      index,
      timestamp,
      previousHash: '00'.repeat(32),
      merkleRoot: '11'.repeat(32),
      nonce: 0,
      bits,
      version: 3,
    },
    hash: '22'.repeat(32),
    transactions: [],
  };
}

const intervalConfig = { ...DEFAULT_CONFIG, retargetInterval: 4, initialBits: GENESIS_BITS };

describe('×1.4 target steps', () => {
  it('divides the target by 1.4 using integer 5/7', () => {
    const old = bitsToTarget(GENESIS_BITS);
    const next = retargetTarget(old);
    expect(next).toBe((old * 5n) / 7n);
    expect(next < old).toBe(true);
  });

  it('multiplies the target by 1.4 when easing', () => {
    const tight = retargetTarget(bitsToTarget(GENESIS_BITS));
    expect(easeTarget(tight)).toBe((tight * 7n) / 5n);
  });

  it('floors at target 1', () => {
    expect(retargetTarget(1n)).toBe(1n);
  });

  it('clamps a proportional retarget to ×1.4 either way', () => {
    const old = bitsToTarget(GENESIS_BITS);
    expect(retargetTowardTimespan(old, 1, 1_000_000)).toBe(retargetTarget(old));
    expect(retargetTowardTimespan(old, 1_000_000, 1)).toBe(easeTarget(old));
    expect(retargetTowardTimespan(old, 600_000, 600_000)).toBe(old);
  });
});

describe('scheduled retarget', () => {
  it('keeps bits until the next index is a multiple of the interval', () => {
    const chain = [headerBlock(0, GENESIS_BITS)];
    expect(computeNextBits(chain, intervalConfig)).toBe(GENESIS_BITS);
    chain.push(headerBlock(1, GENESIS_BITS));
    chain.push(headerBlock(2, GENESIS_BITS));
    expect(computeNextBits(chain, intervalConfig)).toBe(GENESIS_BITS);
    chain.push(headerBlock(3, GENESIS_BITS));
    const tightened = computeNextBits(chain, intervalConfig);
    expect(tightened).not.toBe(GENESIS_BITS);
    expect(tightened).toBe(targetToBits(retargetTarget(bitsToTarget(GENESIS_BITS))));
  });

  it('keeps bits when the window matches the 10-minute target', () => {
    const spacing = intervalConfig.targetBlockTimeMs;
    const bits = targetToBits(retargetTarget(bitsToTarget(GENESIS_BITS)));
    const chain = [
      headerBlock(0, GENESIS_BITS, 1_000),
      headerBlock(1, bits, 1_000 + spacing),
      headerBlock(2, bits, 1_000 + 2 * spacing),
      headerBlock(3, bits, 1_000 + 3 * spacing),
    ];
    expect(computeNextBits(chain, intervalConfig, 1_000 + 3 * spacing + 1)).toBe(bits);
  });

  it('loosens by ×1.4 when the window is much slower than target', () => {
    const bits = targetToBits(retargetTarget(bitsToTarget(GENESIS_BITS)));
    const slow = 20 * 60 * 1000;
    const chain = [
      headerBlock(0, GENESIS_BITS, 1_000),
      headerBlock(1, bits, 1_000 + slow),
      headerBlock(2, bits, 1_000 + 2 * slow),
      headerBlock(3, bits, 1_000 + 3 * slow),
    ];
    const next = computeNextBits(chain, intervalConfig, 1_000 + 3 * slow + 1);
    expect(next).toBe(targetToBits(easeTarget(bitsToTarget(bits))));
  });
});

describe('stall valve', () => {
  it('eases ×1.4 mid-interval after a >10× gap, and does not tighten', () => {
    const bits = targetToBits(retargetTarget(bitsToTarget(GENESIS_BITS)));
    const chain = [headerBlock(0, GENESIS_BITS, 1_000), headerBlock(1, bits, 2_000)];
    const stall = STALL_FACTOR * intervalConfig.targetBlockTimeMs;
    const next = computeNextBits(chain, intervalConfig, 2_000 + stall + 1);
    expect(next).toBe(targetToBits(easeTarget(bitsToTarget(bits))));
  });

  it('falls back to genesis bits after a long outage so one CPU can restart the chain', () => {
    const bits = targetToBits(retargetTarget(bitsToTarget(GENESIS_BITS)));
    const chain = [headerBlock(0, GENESIS_BITS, 1_000), headerBlock(1, bits, 2_000)];
    const year = 365 * 24 * 60 * 60 * 1000;
    expect(computeNextBits(chain, intervalConfig, 2_000 + year)).toBe(GENESIS_BITS);
  });
});
