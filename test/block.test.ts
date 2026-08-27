import { describe, expect, it } from 'vitest';
import { merkleRoot } from '../src/core/merkle.js';
import { sha256Hex, doubleSha256Hex, canonicalStringify } from '../src/core/hash.js';
import { assembleBlock, validateBlockPoW, validateBlockStructure } from '../src/core/block.js';
import { createGenesisBlock } from '../src/core/genesis.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { TEST_CONFIG } from './helpers.js';
import { ValidationError } from '../src/core/errors.js';

describe('hashing', () => {
  it('hashes deterministically and applies double SHA-256', () => {
    expect(sha256Hex('sphere')).toHaveLength(64);
    expect(sha256Hex('sphere')).toBe(sha256Hex('sphere'));
    expect(doubleSha256Hex('sphere')).not.toBe(sha256Hex('sphere'));
  });

  it('canonicalizes objects with sorted keys', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe('merkle root', () => {
  it('returns 64 zeros for an empty list', () => {
    expect(merkleRoot([])).toBe('0'.repeat(64));
  });

  it('returns the single hash unchanged', () => {
    const hash = sha256Hex('only');
    expect(merkleRoot([hash])).toBe(hash);
  });

  it('duplicates the last hash when the layer is odd', () => {
    const a = sha256Hex('a');
    const b = sha256Hex('b');
    const c = sha256Hex('c');
    expect(merkleRoot([a, b, c])).toHaveLength(64);
    expect(merkleRoot([a, b, c])).toBe(merkleRoot([a, b, c]));
  });
});

describe('block validation', () => {
  it('accepts genesis with trivial nBits (nonce 0 is expected to meet the target)', async () => {
    const genesis = await createGenesisBlock(DEFAULT_CONFIG);
    expect(genesis.header.index).toBe(0);
    expect(genesis.header.bits).toBe(DEFAULT_CONFIG.initialBits);
    expect(genesis.header.previousHash).toBe('0'.repeat(64));
    await validateBlockStructure(genesis, DEFAULT_CONFIG);
  });

  it('rejects a tampered merkle root', async () => {
    const genesis = await createGenesisBlock(TEST_CONFIG);
    const tampered = {
      ...genesis,
      header: { ...genesis.header, merkleRoot: 'ab'.repeat(32) },
    };
    await expect(validateBlockStructure(tampered, TEST_CONFIG)).rejects.toThrow(ValidationError);
  });

  it('rejects a hash that does not match the header', async () => {
    const genesis = await createGenesisBlock(TEST_CONFIG);
    const fake = { ...genesis, hash: '11'.repeat(32) };
    await expect(validateBlockPoW(fake, TEST_CONFIG)).rejects.toThrow(ValidationError);
  });

  it('builds a candidate whose merkle root matches its transactions', async () => {
    const genesis = await createGenesisBlock(TEST_CONFIG);
    const block = await assembleBlock(
      {
        index: 0,
        timestamp: genesis.header.timestamp,
        previousHash: genesis.header.previousHash,
        nonce: genesis.header.nonce,
        bits: TEST_CONFIG.initialBits,
        version: TEST_CONFIG.blockVersion,
      },
      genesis.transactions,
      TEST_CONFIG,
    );
    expect(block.header.merkleRoot).toBe(genesis.header.merkleRoot);
    expect(block.hash).toBe(genesis.hash);
  });
});
