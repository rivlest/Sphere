import type { Block, BlockHeader, ChainConfig } from '../types.js';
import { canonicalStringify, doubleSha256Hex } from './hash.js';
import { meetsDifficulty } from './difficulty.js';
import { adjustDifficulty } from './difficulty.js';

export function serializeHeader(header: BlockHeader): string {
  return canonicalStringify(header);
}

export function hashBlockHeader(header: BlockHeader): string {
  return doubleSha256Hex(serializeHeader(header));
}

export function mineBlockSync(header: BlockHeader): { header: BlockHeader; hash: string } {
  const working: BlockHeader = { ...header };
  for (let nonce = 0; nonce <= Number.MAX_SAFE_INTEGER; nonce++) {
    working.nonce = nonce;
    const hash = hashBlockHeader(working);
    if (meetsDifficulty(hash, working.difficulty)) {
      return { header: working, hash };
    }
  }
  throw new Error('Nonce space exhausted');
}

export async function mineBlock(
  header: BlockHeader,
  options: { signal?: AbortSignal; yieldEvery?: number } = {},
): Promise<{ header: BlockHeader; hash: string }> {
  const working: BlockHeader = { ...header };
  const yieldEvery = options.yieldEvery ?? 25_000;

  for (let nonce = 0; nonce <= Number.MAX_SAFE_INTEGER; nonce++) {
    if (options.signal?.aborted) {
      throw new DOMException('Mining aborted', 'AbortError');
    }
    working.nonce = nonce;
    const hash = hashBlockHeader(working);
    if (meetsDifficulty(hash, working.difficulty)) {
      return { header: working, hash };
    }
    if (nonce > 0 && nonce % yieldEvery === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  throw new Error('Nonce space exhausted');
}

export function computeNextDifficulty(chain: Block[], config: ChainConfig): number {
  const nextIndex = chain.length;
  const current = chain[chain.length - 1]?.header.difficulty ?? config.initialDifficulty;
  const interval = config.difficultyAdjustmentInterval;
  if (nextIndex === 0 || nextIndex % interval !== 0) {
    return current;
  }

  const endIdx = chain.length - 1;
  let startIdx = chain.length - interval;
  if (startIdx < 0) startIdx = 0;
  // Skip the genesis timestamp so a hardcoded year-2024 genesis does not
  // look like a multi-year block interval on the first adjustment.
  if (chain[startIdx]?.header.index === 0 && startIdx + 1 <= endIdx) {
    startIdx += 1;
  }

  const actual = Math.max(1, chain[endIdx]!.header.timestamp - chain[startIdx]!.header.timestamp);
  const expected = Math.max(1, (endIdx - startIdx) * config.targetBlockTimeMs);
  return adjustDifficulty(current, actual, expected, config.maxDifficultyChangeFactor);
}
