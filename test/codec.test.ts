import { describe, expect, it } from 'vitest';
import { createGenesisBlock } from '../src/core/genesis.js';
import { TEST_CONFIG } from './helpers.js';
import { decodeBlock, decodeTransaction, encodeBlock, encodeTransaction } from '../src/storage/codec.js';

describe('binary codec', () => {
  it('round-trips the genesis block', async () => {
    const genesis = await createGenesisBlock(TEST_CONFIG);
    const encoded = encodeBlock(genesis);
    expect(decodeBlock(encoded)).toEqual(genesis);
  });

  it('round-trips a coinbase transaction', async () => {
    const genesis = await createGenesisBlock(TEST_CONFIG);
    const tx = genesis.transactions[0]!;
    const encoded = encodeTransaction(tx);
    expect(decodeTransaction(encoded).tx).toEqual(tx);
  });
});
