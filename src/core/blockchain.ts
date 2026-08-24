import {
  DEFAULT_CONFIG,
  type Account,
  type Block,
  type ChainConfig,
  type Transaction,
} from '../types.js';
import { ValidationError } from './errors.js';
import { createGenesisBlock } from './genesis.js';
import { validateBlockStructure } from './block.js';
import { computeNextDifficulty } from './proofOfWork.js';
import { validateTransaction, type AccountSnapshot } from './transaction.js';
import { blockRewardOrbs } from './units.js';

export type AccountMap = Map<string, AccountSnapshot>;

function cloneAccounts(accounts: AccountMap): AccountMap {
  const copy: AccountMap = new Map();
  for (const [address, account] of accounts) {
    copy.set(address, { ...account });
  }
  return copy;
}

export function emptyAccount(): AccountSnapshot {
  return { balance: 0, nonce: 0 };
}

export class Blockchain {
  readonly config: ChainConfig;
  private chain: Block[];
  private accounts: AccountMap = new Map();
  private txHashes = new Set<string>();

  constructor(config: ChainConfig = DEFAULT_CONFIG, blocks?: Block[]) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (blocks && blocks.length > 0) {
      this.chain = [];
      this.hydrateFromSnapshot(blocks);
    } else {
      const genesis = createGenesisBlock(this.config);
      this.chain = [];
      this.applyValidBlock(genesis, { skipLinkChecks: true });
    }
  }

  get height(): number {
    return this.chain.length - 1;
  }

  get length(): number {
    return this.chain.length;
  }

  get difficulty(): number {
    return this.latestBlock.header.difficulty;
  }

  get latestBlock(): Block {
    return this.chain[this.chain.length - 1]!;
  }

  getBlocks(): Block[] {
    return this.chain.map((block) => structuredClone(block));
  }

  getBlockByHash(hash: string): Block | undefined {
    return this.chain.find((block) => block.hash === hash);
  }

  getBlockByHeight(height: number): Block | undefined {
    return this.chain[height];
  }

  getAccount(address: string): Account {
    const snapshot = this.accounts.get(address) ?? emptyAccount();
    return { address, balance: snapshot.balance, nonce: snapshot.nonce };
  }

  hasTransaction(hash: string): boolean {
    return this.txHashes.has(hash);
  }

  nextDifficulty(): number {
    return computeNextDifficulty(this.chain, this.config);
  }

  /**
   * Validates and appends a block that extends the current tip.
   */
  addBlock(block: Block): void {
    this.assertValidSuccessor(block, this.accounts, this.txHashes);
    this.applyValidBlock(block);
  }

  /**
   * Load a snapshot at process start. Unlike `replaceChain`, this does not
   * require the incoming chain to be strictly longer than the current one.
   */
  hydrateFromSnapshot(blocks: Block[]): void {
    this.assertValidChain(blocks);
    const { accounts, txHashes } = this.replay(blocks);
    this.chain = blocks.map((block) => structuredClone(block));
    this.accounts = accounts;
    this.txHashes = txHashes;
  }

  /**
   * Longest valid chain rule. Incoming chain must share genesis and be fully valid.
   */
  replaceChain(newChain: Block[]): boolean {
    if (newChain.length <= this.chain.length) {
      return false;
    }
    this.assertValidChain(newChain);

    const { accounts, txHashes } = this.replay(newChain);
    this.chain = newChain.map((block) => structuredClone(block));
    this.accounts = accounts;
    this.txHashes = txHashes;
    return true;
  }

  forkIndex(other: Block[]): number {
    const limit = Math.min(this.chain.length, other.length);
    let i = 0;
    while (i < limit && this.chain[i]!.hash === other[i]!.hash) {
      i += 1;
    }
    return i;
  }

  private replay(blocks: Block[]): { accounts: AccountMap; txHashes: Set<string> } {
    const accounts: AccountMap = new Map();
    const txHashes = new Set<string>();
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!;
      this.assertValidBlockContents(block, accounts, txHashes, {
        skipLinkChecks: i === 0,
        previous: i === 0 ? undefined : blocks[i - 1],
        expectedDifficulty:
          i === 0
            ? this.config.initialDifficulty
            : computeNextDifficulty(blocks.slice(0, i), this.config),
      });
      this.applyBlockToState(block, accounts, txHashes);
    }
    return { accounts, txHashes };
  }

  private assertValidChain(blocks: Block[]): void {
    if (blocks.length === 0) {
      throw new ValidationError('Chain cannot be empty');
    }
    const genesis = createGenesisBlock(this.config);
    if (blocks[0]!.hash !== genesis.hash) {
      throw new ValidationError('Incoming chain has a different genesis block');
    }
    this.replay(blocks);
  }

  private assertValidSuccessor(block: Block, accounts: AccountMap, txHashes: Set<string>): void {
    this.assertValidBlockContents(block, accounts, txHashes, {
      previous: this.latestBlock,
      expectedDifficulty: this.nextDifficulty(),
    });
  }

  private assertValidBlockContents(
    block: Block,
    accounts: AccountMap,
    txHashes: Set<string>,
    options: {
      skipLinkChecks?: boolean;
      previous?: Block;
      expectedDifficulty?: number;
    },
  ): void {
    validateBlockStructure(block, this.config);

    if (!options.skipLinkChecks) {
      const previous = options.previous;
      if (!previous) {
        throw new ValidationError('Missing previous block');
      }
      if (block.header.index !== previous.header.index + 1) {
        throw new ValidationError(
          `Invalid block index: expected ${previous.header.index + 1}, got ${block.header.index}`,
        );
      }
      if (block.header.previousHash !== previous.hash) {
        throw new ValidationError('previousHash does not match tip');
      }
      if (block.header.timestamp < previous.header.timestamp) {
        throw new ValidationError('Block timestamp is before previous block');
      }
    } else if (block.header.index !== 0) {
      throw new ValidationError('Only genesis may skip link checks');
    }

    if (Date.now() + this.config.maxFutureBlockSkewMs < block.header.timestamp) {
      throw new ValidationError('Block timestamp is too far in the future');
    }

    if (
      options.expectedDifficulty !== undefined &&
      block.header.difficulty !== options.expectedDifficulty &&
      block.header.index !== 0
    ) {
      throw new ValidationError(
        `Unexpected difficulty: expected ${options.expectedDifficulty}, got ${block.header.difficulty}`,
      );
    }

    const working = cloneAccounts(accounts);
    let fees = 0;
    for (let i = 1; i < block.transactions.length; i++) {
      const tx = block.transactions[i]!;
      if (txHashes.has(tx.hash)) {
        throw new ValidationError(`Duplicate transaction ${tx.hash}`);
      }
      validateTransaction(tx, (address) => working.get(address) ?? emptyAccount());
      this.applyUserTransaction(tx, working);
      fees += tx.fee;
    }

    const coinbase = block.transactions[0]!;
    const reward = blockRewardOrbs(
      block.header.index,
      this.config.initialRewardOrbs,
      this.config.halvingInterval,
    );
    if (coinbase.amount !== reward + fees) {
      throw new ValidationError(
        `Invalid coinbase amount: expected ${reward + fees}, got ${coinbase.amount}`,
      );
    }
    if (coinbase.nonce !== block.header.index) {
      throw new ValidationError('Coinbase nonce must equal block index');
    }
    validateTransaction(coinbase, () => emptyAccount());
  }

  private applyUserTransaction(tx: Transaction, accounts: AccountMap): void {
    const sender = { ...(accounts.get(tx.from) ?? emptyAccount()) };
    sender.balance -= tx.amount + tx.fee;
    sender.nonce = tx.nonce;
    accounts.set(tx.from, sender);

    const recipient = { ...(accounts.get(tx.to) ?? emptyAccount()) };
    recipient.balance += tx.amount;
    accounts.set(tx.to, recipient);
  }

  private applyBlockToState(block: Block, accounts: AccountMap, txHashes: Set<string>): void {
    for (let i = 1; i < block.transactions.length; i++) {
      this.applyUserTransaction(block.transactions[i]!, accounts);
      txHashes.add(block.transactions[i]!.hash);
    }
    const coinbase = block.transactions[0]!;
    const miner = { ...(accounts.get(coinbase.to) ?? emptyAccount()) };
    miner.balance += coinbase.amount;
    accounts.set(coinbase.to, miner);
    txHashes.add(coinbase.hash);
  }

  private applyValidBlock(block: Block, options: { skipLinkChecks?: boolean } = {}): void {
    if (!options.skipLinkChecks) {
      this.assertValidSuccessor(block, this.accounts, this.txHashes);
    } else {
      this.assertValidBlockContents(block, this.accounts, this.txHashes, {
        skipLinkChecks: true,
        expectedDifficulty: this.config.initialDifficulty,
      });
    }
    this.applyBlockToState(block, this.accounts, this.txHashes);
    this.chain.push(structuredClone(block));
  }
}
