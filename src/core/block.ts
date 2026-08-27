import type { Block, BlockHeader, ChainConfig, Transaction } from '../types.js';
import { hashBlockHeader } from './proofOfWork.js';
import { merkleRoot } from './merkle.js';
import { isValidBits, meetsProofOfWork } from './bits.js';
import { ValidationError } from './errors.js';
import { createCoinbaseTransaction, isCoinbaseTx, transactionFee, type Utxo } from './transaction.js';
import { blockRewardOrbs } from './units.js';

export interface ChainTip {
  latestBlock: Block;
  nextBits(atTimestamp?: number): number;
  config: ChainConfig;
  getUtxo(txid: string, vout: number): Utxo | undefined;
}

export async function computeBlockHash(header: BlockHeader, config: ChainConfig): Promise<string> {
  return hashBlockHeader(header, config.pow);
}

export async function createCandidateBlock(
  chain: ChainTip,
  minerAddress: string,
  userTransactions: Transaction[],
): Promise<Block> {
  const previous = chain.latestBlock;
  const index = previous.header.index + 1;
  const timestamp = Math.max(Date.now(), previous.header.timestamp + 1);
  const fees = userTransactions.reduce(
    (sum, tx) => sum + transactionFee(tx, (txid, vout) => chain.getUtxo(txid, vout)),
    0,
  );
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
      bits: chain.nextBits(timestamp),
      version: chain.config.blockVersion,
    },
    [coinbase, ...userTransactions],
    chain.config,
  );
}

export async function assembleBlock(
  header: Omit<BlockHeader, 'merkleRoot'>,
  transactions: Transaction[],
  config: ChainConfig,
): Promise<Block> {
  const merkle = merkleRoot(transactions.map((tx) => tx.hash));
  const fullHeader: BlockHeader = { ...header, merkleRoot: merkle };
  const hash = await computeBlockHash(fullHeader, config);
  return { header: fullHeader, hash, transactions };
}

export async function validateBlockPoW(block: Block, config: ChainConfig): Promise<void> {
  const expectedHash = await computeBlockHash(block.header, config);
  if (block.hash !== expectedHash) {
    throw new ValidationError('Block hash does not match header');
  }
  if (!meetsProofOfWork(block.hash, block.header.bits)) {
    throw new ValidationError('Block does not satisfy proof-of-work target');
  }
}

export async function validateBlockStructure(block: Block, config: ChainConfig): Promise<void> {
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
  if (!isValidBits(header.bits)) {
    throw new ValidationError('Invalid bits');
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
  await validateBlockPoW(block, config);
}
