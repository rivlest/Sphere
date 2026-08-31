import type { Block, ChainConfig } from '../types.js';
import {
  bitsToTarget,
  clampTarget,
  easeTarget,
  retargetTarget,
  targetToBits,
} from './bits.js';

/** If the gap since the tip exceeds this many target spacings, ease instead of tightening. */
export const STALL_FACTOR = 10;

/**
 * Next compact bits for `nextTimestamp`.
 *
 * - Stall valve: if the candidate is more than 10× the target spacing after the tip,
 *   ease ×1.4 per full stall window (capped at genesis). A year-long outage therefore
 *   falls back to trivial bits on the next block — the chain cannot lock forever.
 * - Every `retargetInterval` blocks, move the target toward a 10-minute average,
 *   clamped to ×1.4 either way. Fast windows still tighten; slow windows loosen.
 *   That is the 100-year equilibrium: work tracks hashrate instead of ratcheting away.
 */
export function computeNextBits(
  chain: Array<Pick<Block, 'header'>>,
  config: ChainConfig,
  nextTimestamp?: number,
): number {
  if (chain.length === 0) return config.initialBits;
  const tip = chain[chain.length - 1]!;
  const current = tip.header.bits;
  const at = nextTimestamp ?? tip.header.timestamp + 1;
  const stallMs = STALL_FACTOR * config.targetBlockTimeMs;
  const gap = Math.max(0, at - tip.header.timestamp);

  if (gap > stallMs) {
    return easeAfterStall(current, gap, stallMs, config.initialBits);
  }

  const nextIndex = tip.header.index + 1;
  const interval = config.retargetInterval;
  if (nextIndex === 0 || nextIndex % interval !== 0) {
    return current;
  }

  const { actualMs, expectedMs } = windowTimespan(chain, interval, config.targetBlockTimeMs);
  const nextTarget = clampTarget(
    retargetTowardTimespan(bitsToTarget(current), actualMs, expectedMs),
    config.initialBits,
  );
  if (nextTarget === bitsToTarget(current)) return current;
  return targetToBits(nextTarget);
}

function easeAfterStall(
  currentBits: number,
  gapMs: number,
  stallMs: number,
  genesisBits: number,
): number {
  const steps = Math.min(512, Math.floor(gapMs / stallMs));
  let target = bitsToTarget(currentBits);
  const easiest = bitsToTarget(genesisBits);
  for (let i = 0; i < steps; i++) {
    target = easeTarget(target);
    if (target >= easiest) {
      return genesisBits;
    }
  }
  return targetToBits(clampTarget(target, genesisBits));
}

function windowTimespan(
  chain: Array<Pick<Block, 'header'>>,
  interval: number,
  targetBlockTimeMs: number,
): { actualMs: number; expectedMs: number } {
  const end = chain[chain.length - 1]!;
  let startIdx = chain.length - interval;
  if (startIdx < 0) startIdx = 0;
  // A hardcoded genesis date must not look like a multi-year first window.
  if (chain[startIdx]?.header.index === 0 && startIdx + 1 <= chain.length - 1) {
    startIdx += 1;
  }
  const start = chain[startIdx]!;
  const gaps = Math.max(1, end.header.index - start.header.index);
  const actualMs = Math.max(1, end.header.timestamp - start.header.timestamp);
  const expectedMs = Math.max(1, gaps * targetBlockTimeMs);
  return { actualMs, expectedMs };
}

/** Move target by actual/expected, clamped to ÷1.4 .. ×1.4. */
export function retargetTowardTimespan(
  oldTarget: bigint,
  actualMs: number,
  expectedMs: number,
): bigint {
  const actual = BigInt(Math.max(1, Math.floor(actualMs)));
  const expected = BigInt(Math.max(1, Math.floor(expectedMs)));
  let next = (oldTarget * actual) / expected;
  const tighter = retargetTarget(oldTarget);
  const easier = easeTarget(oldTarget);
  if (next < tighter) next = tighter;
  if (next > easier) next = easier;
  return next < 1n ? 1n : next;
}
