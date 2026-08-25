import {
  DEFAULT_CONFIG,
  GENESIS_COINBASE_ADDRESS,
  type Block,
  type ChainConfig,
} from '../types.js';
import { createCoinbaseTransaction } from './transaction.js';
import { merkleRoot } from './merkle.js';
import { hashBlockHeader } from './proofOfWork.js';
import { blockRewardOrbs } from './units.js';

export const GENESIS_PREVIOUS_HASH = '0'.repeat(64);

/** Public genesis coinbase address. No private key is shipped in source. */
export function faucetAddress(): string {
  return GENESIS_COINBASE_ADDRESS;
}

export function createGenesisBlock(config: ChainConfig = DEFAULT_CONFIG): Block {
  const timestamp = config.genesisTimestamp;
  const reward = blockRewardOrbs(0, config.initialRewardOrbs, config.halvingInterval);
  const coinbase = createCoinbaseTransaction({
    to: faucetAddress(),
    amount: reward,
    blockIndex: 0,
    timestamp,
  });
  const header = {
    index: 0,
    timestamp,
    previousHash: GENESIS_PREVIOUS_HASH,
    merkleRoot: merkleRoot([coinbase.hash]),
    nonce: 0,
    difficulty: config.initialDifficulty,
    version: config.blockVersion,
  };
  return {
    header,
    hash: hashBlockHeader(header),
    transactions: [coinbase],
  };
}
