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
import { meetsProofOfWork } from './bits.js';

export const GENESIS_PREVIOUS_HASH = '0'.repeat(64);

const genesisCache = new Map<string, Block>();

function genesisCacheKey(config: ChainConfig): string {
  return JSON.stringify({
    genesisTimestamp: config.genesisTimestamp,
    initialBits: config.initialBits,
    blockVersion: config.blockVersion,
    initialRewardOrbs: config.initialRewardOrbs,
    halvingInterval: config.halvingInterval,
    pow: config.pow,
  });
}

/** Public genesis coinbase address. No private key is shipped in source. */
export function faucetAddress(): string {
  return GENESIS_COINBASE_ADDRESS;
}

export async function createGenesisBlock(config: ChainConfig = DEFAULT_CONFIG): Promise<Block> {
  const key = genesisCacheKey(config);
  const cached = genesisCache.get(key);
  if (cached) return structuredClone(cached);

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
    bits: config.initialBits,
    version: config.blockVersion,
  };

  let nonce = 0;
  let hash = await hashBlockHeader({ ...header, nonce }, config.pow);
  while (!meetsProofOfWork(hash, header.bits)) {
    nonce += 1;
    hash = await hashBlockHeader({ ...header, nonce }, config.pow);
  }

  const block: Block = {
    header: { ...header, nonce },
    hash,
    transactions: [coinbase],
  };
  genesisCache.set(key, block);
  return structuredClone(block);
}
