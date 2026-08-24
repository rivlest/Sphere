/**
 * Difficulty is the required number of leading hex zeros in the block hash.
 *
 * Each extra zero is 16× more work, so we scale *work* proportionally
 * (Bitcoin-style ×4 / ÷4 clamp) and map the result back onto an integer
 * zero-count. Instant local mining therefore climbs by at most +1 zero
 * every adjustment window instead of jumping to an unmineable target.
 */
export function adjustDifficulty(
  currentDifficulty: number,
  actualTimeMs: number,
  expectedTimeMs: number,
  maxFactor = 4,
): number {
  const actual = Math.max(1, actualTimeMs);
  const expected = Math.max(1, expectedTimeMs);
  let factor = expected / actual;
  if (factor > maxFactor) factor = maxFactor;
  if (factor < 1 / maxFactor) factor = 1 / maxFactor;

  const zeroDelta = Math.log(factor) / Math.log(16);
  let next: number;
  if (Math.abs(zeroDelta) <= 0.5) {
    if (factor >= maxFactor) next = currentDifficulty + 1;
    else if (factor <= 1 / maxFactor) next = currentDifficulty - 1;
    else next = currentDifficulty;
  } else {
    next = Math.round(currentDifficulty + zeroDelta);
  }

  return Math.max(1, next);
}

export function meetsDifficulty(hash: string, difficulty: number): boolean {
  if (difficulty <= 0) return true;
  return hash.startsWith('0'.repeat(difficulty));
}
