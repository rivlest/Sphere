import {
  DEFAULT_CONFIG,
  type Account,
  type Block,
  type BlockHeader,
  type ChainConfig,
  type Transaction,
} from '../types.js';
import { ValidationError } from './errors.js';
import { createGenesisBlock } from './genesis.js';
import { validateBlockStructure } from './block.js';
import { computeNextBits } from './retarget.js';
import { workRatio } from './bits.js';
import {
  outpointKey,
  outputSum,
  transactionFee,
  validateTransaction,
  type Utxo,
} from './transaction.js';
import { blockRewardOrbs } from './units.js';
import type { BlockArchive } from '../storage/persistence.js';

export type UtxoMap = Map<string, Utxo>;

/** Full transaction bodies kept in RAM. Headers and the UTXO set cover the whole chain. */
export const BLOCK_CACHE_SIZE = 288;

type HeaderRecord = { hash: string; header: BlockHeader };

function cloneUtxos(utxos: UtxoMap): UtxoMap {
  const copy: UtxoMap = new Map();
  for (const [key, utxo] of utxos) {
    copy.set(key, { ...utxo });
  }
  return copy;
}

export class Blockchain {
  readonly config: ChainConfig;
  private headers: HeaderRecord[] = [];
  private fullBlocks = new Map<number, Block>();
  private hashToHeight = new Map<string, number>();
  private utxos: UtxoMap = new Map();
  private txIndex = new Map<string, number>();
  private cacheLimit = Number.POSITIVE_INFINITY;
  private archive: BlockArchive | null = null;

  private constructor(config: ChainConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config, pow: config.pow ?? DEFAULT_CONFIG.pow };
  }

  static async open(config: ChainConfig = DEFAULT_CONFIG, blocks?: Block[]): Promise<Blockchain> {
    const chain = new Blockchain(config);
    if (blocks && blocks.length > 0) {
      await chain.hydrateFromSnapshot(blocks);
    } else {
      const genesis = await createGenesisBlock(chain.config);
      await chain.applyValidBlock(genesis, { skipLinkChecks: true });
    }
    return chain;
  }

  static async openArchive(
    config: ChainConfig,
    archive: BlockArchive,
    cacheLimit = BLOCK_CACHE_SIZE,
  ): Promise<Blockchain> {
    const chain = new Blockchain(config);
    chain.archive = archive;
    chain.cacheLimit = cacheLimit;
    let count = 0;
    for await (const block of archive.iterateBlocks()) {
      if (count === 0) {
        await chain.applyValidBlock(block, { skipLinkChecks: true, persist: false });
      } else {
        await chain.applyValidBlock(block, { persist: false });
      }
      count += 1;
    }
    if (count === 0) {
      const genesis = await createGenesisBlock(chain.config);
      await chain.applyValidBlock(genesis, { skipLinkChecks: true, persist: true });
    }
    return chain;
  }

  get height(): number {
    return this.headers.length - 1;
  }

  get length(): number {
    return this.headers.length;
  }

  get bits(): number {
    return this.latestBlock.header.bits;
  }

  /** Work vs genesis target (1 at height 0). Exposed as `difficulty` on the REST status API. */
  get difficulty(): number {
    return workRatio(this.bits, this.config.initialBits);
  }

  get latestBlock(): Block {
    const block = this.fullBlocks.get(this.height);
    if (!block) {
      throw new Error('Tip block is not in the cache');
    }
    return block;
  }

  hashAt(height: number): string | undefined {
    return this.headers[height]?.hash;
  }

  getBlocks(): Block[] {
    return this.headers.map((_, height) => {
      const block = this.fullBlocks.get(height);
      if (!block) {
        throw new Error(`Block ${height} is not in memory; use getBlocksRange`);
      }
      return structuredClone(block);
    });
  }

  async getBlocksRange(from: number, limit: number): Promise<Block[]> {
    const start = Math.max(0, from);
    const end = Math.min(this.headers.length, start + Math.max(0, limit));
    const blocks: Block[] = [];
    for (let height = start; height < end; height++) {
      const block = await this.fetchBlock(height);
      if (block) blocks.push(structuredClone(block));
    }
    return blocks;
  }

  hasBlockHash(hash: string): boolean {
    return this.hashToHeight.has(hash);
  }

  getBlockByHash(hash: string): Block | undefined {
    const height = this.hashToHeight.get(hash);
    if (height === undefined) return undefined;
    return this.fullBlocks.get(height);
  }

  getBlockByHeight(height: number): Block | undefined {
    return this.fullBlocks.get(height);
  }

  async fetchBlock(height: number): Promise<Block | undefined> {
    const cached = this.fullBlocks.get(height);
    if (cached) return cached;
    if (!this.archive) return undefined;
    const block = await this.archive.readBlock(height);
    if (block) this.rememberFull(block);
    return block;
  }

  async fetchBlockByHash(hash: string): Promise<Block | undefined> {
    const height = this.hashToHeight.get(hash);
    if (height === undefined) return undefined;
    return this.fetchBlock(height);
  }

  getUtxo(txid: string, vout: number): Utxo | undefined {
    return this.utxos.get(outpointKey(txid, vout));
  }

  getUtxos(address: string): Utxo[] {
    return [...this.utxos.values()].filter((utxo) => utxo.address === address);
  }

  getAccount(address: string): Account {
    const balance = this.getUtxos(address).reduce((sum, utxo) => sum + utxo.amount, 0);
    return { address, balance };
  }

  getTransaction(hash: string): Transaction | undefined {
    for (const block of this.fullBlocks.values()) {
      const match = block.transactions.find((tx) => tx.hash === hash);
      if (match) return match;
    }
    return undefined;
  }

  async findTransaction(hash: string): Promise<{ tx: Transaction; height: number; blockHash: string } | undefined> {
    const height = this.txIndex.get(hash);
    if (height === undefined) return undefined;
    const block = await this.fetchBlock(height);
    const tx = block?.transactions.find((item) => item.hash === hash);
    if (!tx || !block) return undefined;
    return { tx, height, blockHash: block.hash };
  }

  /** Live UTXO, or the output as it existed before being spent (for history). */
  resolveOutpoint(txid: string, vout: number): Utxo | undefined {
    const live = this.getUtxo(txid, vout);
    if (live) return live;
    const previous = this.getTransaction(txid);
    const output = previous?.outputs[vout];
    if (!output) return undefined;
    return { txid, vout, address: output.address, amount: output.amount };
  }

  async resolveOutpointDeep(txid: string, vout: number): Promise<Utxo | undefined> {
    const live = this.getUtxo(txid, vout);
    if (live) return live;
    const found = await this.findTransaction(txid);
    const output = found?.tx.outputs[vout];
    if (!output) return undefined;
    return { txid, vout, address: output.address, amount: output.amount };
  }

  getSupplyStats(): { circulatingOrbs: number; holders: number } {
    let circulatingOrbs = 0;
    const holders = new Set<string>();
    for (const utxo of this.utxos.values()) {
      if (utxo.amount > 0) {
        circulatingOrbs += utxo.amount;
        holders.add(utxo.address);
      }
    }
    return { circulatingOrbs, holders: holders.size };
  }

  hasTransaction(hash: string): boolean {
    return this.txIndex.has(hash);
  }

  nextBits(atTimestamp = Date.now()): number {
    return computeNextBits(this.headers, this.config, atTimestamp);
  }

  async addBlock(block: Block): Promise<void> {
    await this.assertValidSuccessor(block, this.utxos, this.txIndex);
    await this.commitBlock(block, { persist: true });
  }

  async hydrateFromSnapshot(blocks: Block[]): Promise<void> {
    await this.assertValidChain(blocks);
    const { utxos, txIndex } = await this.replay(blocks);
    this.resetIndex();
    this.utxos = utxos;
    this.txIndex = txIndex;
    for (const block of blocks) {
      this.indexBlock(block);
    }
  }

  async replaceChain(newChain: Block[]): Promise<boolean> {
    if (newChain.length <= this.headers.length) {
      return false;
    }
    await this.assertValidChain(newChain);
    const { utxos, txIndex } = await this.replay(newChain);
    this.resetIndex();
    this.utxos = utxos;
    this.txIndex = txIndex;
    for (const block of newChain) {
      this.indexBlock(block);
    }
    if (this.archive) {
      await this.archive.truncateTo(0);
      for (const block of newChain) {
        await this.archive.appendBlock(block);
      }
    }
    return true;
  }

  forkIndex(other: Block[]): number {
    const limit = Math.min(this.headers.length, other.length);
    let i = 0;
    while (i < limit && this.headers[i]!.hash === other[i]!.hash) {
      i += 1;
    }
    return i;
  }

  async rewindTo(newHeight: number): Promise<void> {
    if (newHeight < 0 || newHeight >= this.headers.length) {
      throw new ValidationError('Invalid rewind height');
    }
    if (this.archive) {
      await this.archive.truncateTo(newHeight + 1);
      await this.rebuildFromArchive();
      return;
    }
    const kept = this.headers.slice(0, newHeight + 1).map((record) => {
      const block = this.fullBlocks.get(record.header.index);
      if (!block) throw new Error(`Cannot rewind: block ${record.header.index} not in memory`);
      return block;
    });
    await this.hydrateFromSnapshot(kept);
  }

  private async rebuildFromArchive(): Promise<void> {
    if (!this.archive) return;
    this.resetIndex();
    this.utxos = new Map();
    this.txIndex = new Map();
    for await (const block of this.archive.iterateBlocks()) {
      this.applyBlockToState(block, this.utxos, this.txIndex);
      this.indexBlock(block);
    }
  }

  private async replay(blocks: Block[]): Promise<{ utxos: UtxoMap; txIndex: Map<string, number> }> {
    const utxos: UtxoMap = new Map();
    const txIndex = new Map<string, number>();
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!;
      await this.assertValidBlockContents(block, utxos, txIndex, {
        skipLinkChecks: i === 0,
        previous: i === 0 ? undefined : blocks[i - 1],
        expectedBits:
          i === 0
            ? this.config.initialBits
            : computeNextBits(
                blocks.slice(0, i).map((item) => ({ header: item.header, hash: item.hash })),
                this.config,
                block.header.timestamp,
              ),
      });
      this.applyBlockToState(block, utxos, txIndex);
    }
    return { utxos, txIndex };
  }

  private async assertValidChain(blocks: Block[]): Promise<void> {
    if (blocks.length === 0) {
      throw new ValidationError('Chain cannot be empty');
    }
    const genesis = await createGenesisBlock(this.config);
    if (blocks[0]!.hash !== genesis.hash) {
      throw new ValidationError('Incoming chain has a different genesis block');
    }
    await this.replay(blocks);
  }

  private async assertValidSuccessor(
    block: Block,
    utxos: UtxoMap,
    txIndex: Map<string, number>,
  ): Promise<void> {
    await this.assertValidBlockContents(block, utxos, txIndex, {
      previous: this.latestBlock,
      expectedBits: computeNextBits(this.headers, this.config, block.header.timestamp),
    });
  }

  private async assertValidBlockContents(
    block: Block,
    utxos: UtxoMap,
    txIndex: Map<string, number>,
    options: {
      skipLinkChecks?: boolean;
      previous?: Block;
      expectedBits?: number;
    },
  ): Promise<void> {
    await validateBlockStructure(block, this.config);

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
      options.expectedBits !== undefined &&
      block.header.bits !== options.expectedBits &&
      block.header.index !== 0
    ) {
      throw new ValidationError(
        `Unexpected bits: expected ${options.expectedBits}, got ${block.header.bits}`,
      );
    }

    const working = cloneUtxos(utxos);
    let fees = 0;
    for (let i = 1; i < block.transactions.length; i++) {
      const tx = block.transactions[i]!;
      if (txIndex.has(tx.hash)) {
        throw new ValidationError(`Duplicate transaction ${tx.hash}`);
      }
      validateTransaction(tx, (txid, vout) => working.get(outpointKey(txid, vout)));
      fees += transactionFee(tx, (txid, vout) => working.get(outpointKey(txid, vout)));
      this.applyUserTransaction(tx, working);
    }

    const coinbase = block.transactions[0]!;
    const reward = blockRewardOrbs(
      block.header.index,
      this.config.initialRewardOrbs,
      this.config.halvingInterval,
    );
    if (outputSum(coinbase) !== reward + fees) {
      throw new ValidationError(
        `Invalid coinbase amount: expected ${reward + fees}, got ${outputSum(coinbase)}`,
      );
    }
    if (coinbase.inputs[0]!.vout !== block.header.index) {
      throw new ValidationError('Coinbase input vout must equal block index');
    }
    validateTransaction(coinbase, () => undefined);
  }

  private applyUserTransaction(tx: Transaction, utxos: UtxoMap): void {
    for (const input of tx.inputs) {
      utxos.delete(outpointKey(input.txid, input.vout));
    }
    tx.outputs.forEach((output, vout) => {
      utxos.set(outpointKey(tx.hash, vout), {
        txid: tx.hash,
        vout,
        address: output.address,
        amount: output.amount,
      });
    });
  }

  private applyBlockToState(block: Block, utxos: UtxoMap, txIndex: Map<string, number>): void {
    for (let i = 1; i < block.transactions.length; i++) {
      this.applyUserTransaction(block.transactions[i]!, utxos);
      txIndex.set(block.transactions[i]!.hash, block.header.index);
    }
    const coinbase = block.transactions[0]!;
    this.applyUserTransaction(coinbase, utxos);
    txIndex.set(coinbase.hash, block.header.index);
  }

  private async applyValidBlock(
    block: Block,
    options: { skipLinkChecks?: boolean; persist?: boolean } = {},
  ): Promise<void> {
    const persist = options.persist !== false;
    if (!options.skipLinkChecks) {
      await this.assertValidSuccessor(block, this.utxos, this.txIndex);
    } else {
      await this.assertValidBlockContents(block, this.utxos, this.txIndex, {
        skipLinkChecks: true,
        expectedBits: this.config.initialBits,
      });
    }
    await this.commitBlock(block, { persist });
  }

  private async commitBlock(block: Block, options: { persist: boolean }): Promise<void> {
    this.applyBlockToState(block, this.utxos, this.txIndex);
    this.indexBlock(block);
    if (options.persist && this.archive) {
      await this.archive.appendBlock(block);
    }
  }

  private indexBlock(block: Block): void {
    const height = block.header.index;
    this.headers[height] = { hash: block.hash, header: { ...block.header } };
    if (this.headers.length !== height + 1) {
      this.headers.length = height + 1;
    }
    this.hashToHeight.set(block.hash, height);
    this.rememberFull(block);
  }

  private rememberFull(block: Block): void {
    this.fullBlocks.set(block.header.index, structuredClone(block));
    this.evictCache();
  }

  private evictCache(): void {
    if (this.fullBlocks.size <= this.cacheLimit) return;
    const keepFrom = Math.max(0, this.headers.length - this.cacheLimit);
    for (const height of [...this.fullBlocks.keys()]) {
      if (height < keepFrom && height !== this.height) {
        this.fullBlocks.delete(height);
      }
    }
  }

  private resetIndex(): void {
    this.headers = [];
    this.fullBlocks.clear();
    this.hashToHeight.clear();
  }
}
