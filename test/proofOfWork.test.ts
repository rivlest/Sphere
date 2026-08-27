import { describe, expect, it } from 'vitest';
import { GENESIS_BITS, meetsProofOfWork } from '../src/core/bits.js';
import { hashBlockHeader, mineBlock } from '../src/core/proofOfWork.js';
import { DEFAULT_POW, type BlockHeader } from '../src/types.js';

function header(partial: Partial<BlockHeader> = {}): BlockHeader {
  return {
    index: 1,
    timestamp: 1_704_067_260_000,
    previousHash: 'ab'.repeat(32),
    merkleRoot: 'cd'.repeat(32),
    nonce: 0,
    bits: GENESIS_BITS,
    version: 3,
    ...partial,
  };
}

describe('proof of work', () => {
  it('hashes a header with Argon2id (32-byte hex, deterministic)', async () => {
    const hashed = await hashBlockHeader(header(), DEFAULT_POW);
    expect(hashed).toHaveLength(64);
    expect(hashed).toBe(await hashBlockHeader(header(), DEFAULT_POW));
    expect(hashed).not.toBe(await hashBlockHeader(header({ nonce: 1 }), DEFAULT_POW));
  });

  it('mines a header whose hash is at or below the compact target', async () => {
    const { header: mined, hash } = await mineBlock(header());
    expect(meetsProofOfWork(hash, mined.bits)).toBe(true);
    expect(hash).toBe(await hashBlockHeader(mined, DEFAULT_POW));
  });

  it('can be aborted before the first hash', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(mineBlock(header(), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
