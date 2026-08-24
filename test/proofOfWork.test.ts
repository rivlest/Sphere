import { describe, expect, it } from 'vitest';
import { adjustDifficulty, meetsDifficulty } from '../src/core/difficulty.js';
import { mineBlock, mineBlockSync, hashBlockHeader } from '../src/core/proofOfWork.js';
import type { BlockHeader } from '../src/types.js';

function header(partial: Partial<BlockHeader> = {}): BlockHeader {
  return {
    index: 1,
    timestamp: 1_704_067_260_000,
    previousHash: 'ab'.repeat(32),
    merkleRoot: 'cd'.repeat(32),
    nonce: 0,
    difficulty: 1,
    version: 1,
    ...partial,
  };
}

describe('proof of work', () => {
  it('mines a header that meets the leading-zero difficulty', async () => {
    const { header: mined, hash } = await mineBlock(header({ difficulty: 2 }));
    expect(meetsDifficulty(hash, 2)).toBe(true);
    expect(hash).toBe(hashBlockHeader(mined));
    expect(hash.startsWith('00')).toBe(true);
  });

  it('mines synchronously for low difficulty', () => {
    const { hash } = mineBlockSync(header({ difficulty: 1 }));
    expect(hash.startsWith('0')).toBe(true);
  });

  it('can be aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      mineBlock(header({ difficulty: 8 }), { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('difficulty adjustment', () => {
  it('increases difficulty when blocks are much faster than target, capped at 4x work', () => {
    expect(adjustDifficulty(3, 1_000, 600_000, 4)).toBe(4);
  });

  it('decreases difficulty when blocks are much slower than target, floored at 1', () => {
    expect(adjustDifficulty(3, 2_400_000, 600_000, 4)).toBe(2);
    expect(adjustDifficulty(1, 2_400_000, 600_000, 4)).toBe(1);
  });

  it('keeps difficulty when the window is close to target', () => {
    expect(adjustDifficulty(3, 600_000, 600_000, 4)).toBe(3);
  });
});
