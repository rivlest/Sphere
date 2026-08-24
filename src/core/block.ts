import type { Block, BlockHeader, ChainConfig, Transaction } from '../types.js';
import { hashBlockHeader } from './proofOfWork.js';
import { merkleRoot } from './merkle.js';
import { meetsDifficulty } from './difficulty.js';
import { ValidationError } from './errors.js';
import { createCoinbaseTransaction, isCoinbaseTx } from './transaction.js';
import { blockRewardOrbs } from './units.js';

export interface ChainTip {
  latestBlock: Block;
  nextDifficulty(): number;
  config: ChainConfig;
}

export function computeBlockHash(header: BlockHeader): string {
  return hashBlockHeader(header);
}

export function createCandidateBlock(
  chain: ChainTip,
  minerAddress: string,
  userTransactions: Transaction[],
): Block {
  const previous = chain.latestBlock;
  const index = previous.header.index + 1;
  const timestamp = Math.max(Date.now(), previous.header.timestamp + 1);
  const fees = userTransactions.reduce((sum, tx) => sum + tx.fee, 0);
  const reward =
    blockRewardOrbs(index, chain.config.initialRewardOrbs, chain.config.halvingInterval) + fees;
  const coinbase = createCoinbaseTransaction({
    to: minerAddress,
    amount: reward,
    blockIndex: index,
    timestamp,
  });
  return assembleBlock(
    {
      index,
      timestamp,
      previousHash: previous.hash,
      nonce: 0,
      difficulty: chain.nextDifficulty(),
      version: chain.config.blockVersion,
    },
    [coinbase, ...userTransactions],
  );
}

export function assembleBlock(
  header: Omit<BlockHeader, 'merkleRoot'>,
  transactions: Transaction[],
): Block {
  const merkle = merkleRoot(transactions.map((tx) => tx.hash));
  const fullHeader: BlockHeader = { ...header, merkleRoot: merkle };
  const hash = computeBlockHash(fullHeader);
  return { header: fullHeader, hash, transactions };
}

export function validateBlockPoW(block: Block, options: { skipGenesisPow?: boolean } = {}): void {
  const expectedHash = computeBlockHash(block.header);
  if (block.hash !== expectedHash) {
    throw new ValidationError('Block hash does not match header');
  }
  const isGenesis = block.header.index === 0;
  if (isGenesis && options.skipGenesisPow) {
    return;
  }
  if (!meetsDifficulty(block.hash, block.header.difficulty)) {
    throw new ValidationError('Block does not satisfy proof-of-work difficulty');
  }
}

export function validateBlockStructure(block: Block, config: ChainConfig): void {
  const { header, transactions } = block;
  if (header.version !== config.blockVersion) {
    throw new ValidationError(`Unsupported block version ${header.version}`);
  }
  if (!Number.isInteger(header.index) || header.index < 0) {
    throw new ValidationError('Invalid block index');
  }
  if (!Number.isInteger(header.timestamp) || header.timestamp <= 0) {
    throw new ValidationError('Invalid block timestamp');
  }
  if (!Number.isInteger(header.nonce) || header.nonce < 0) {
    throw new ValidationError('Invalid nonce');
  }
  if (!Number.isInteger(header.difficulty) || header.difficulty < 0) {
    throw new ValidationError('Invalid difficulty');
  }
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new ValidationError('Block must contain at least a coinbase transaction');
  }
  if (transactions.length > config.maxTransactionsPerBlock) {
    throw new ValidationError(`Block exceeds max transactions (${config.maxTransactionsPerBlock})`);
  }
  const expectedMerkle = merkleRoot(transactions.map((tx) => tx.hash));
  if (header.merkleRoot !== expectedMerkle) {
    throw new ValidationError('Invalid merkle root');
  }
  if (!isCoinbaseTx(transactions[0]!)) {
    throw new ValidationError('First transaction must be coinbase');
  }
  for (let i = 1; i < transactions.length; i++) {
    if (isCoinbaseTx(transactions[i]!)) {
      throw new ValidationError('Only the first transaction may be coinbase');
    }
  }
  const hashes = new Set<string>();
  for (const tx of transactions) {
    if (hashes.has(tx.hash)) {
      throw new ValidationError('Duplicate transaction in block');
    }
    hashes.add(tx.hash);
  }
  validateBlockPoW(block, { skipGenesisPow: true });
}
