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

export type UtxoMap = Map<string, Utxo>;

function cloneUtxos(utxos: UtxoMap): UtxoMap {
  const copy: UtxoMap = new Map();
  for (const [key, utxo] of utxos) {
    copy.set(key, { ...utxo });
  }
  return copy;
}

export class Blockchain {
  readonly config: ChainConfig;
  private chain: Block[] = [];
  private utxos: UtxoMap = new Map();
  private txHashes = new Set<string>();

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

  get height(): number {
    return this.chain.length - 1;
  }

  get length(): number {
    return this.chain.length;
  }

  get bits(): number {
    return this.latestBlock.header.bits;
  }

  /** Work vs genesis target (1 at height 0). Exposed as `difficulty` on the REST status API. */
  get difficulty(): number {
    return workRatio(this.bits, this.config.initialBits);
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
    for (const block of this.chain) {
      const match = block.transactions.find((tx) => tx.hash === hash);
      if (match) return match;
    }
    return undefined;
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
    return this.txHashes.has(hash);
  }

  nextBits(atTimestamp = Date.now()): number {
    return computeNextBits(this.chain, this.config, atTimestamp);
  }

  async addBlock(block: Block): Promise<void> {
    await this.assertValidSuccessor(block, this.utxos, this.txHashes);
    this.commitBlock(block);
  }

  async hydrateFromSnapshot(blocks: Block[]): Promise<void> {
    await this.assertValidChain(blocks);
    const { utxos, txHashes } = await this.replay(blocks);
    this.chain = blocks.map((block) => structuredClone(block));
    this.utxos = utxos;
    this.txHashes = txHashes;
  }

  async replaceChain(newChain: Block[]): Promise<boolean> {
    if (newChain.length <= this.chain.length) {
      return false;
    }
    await this.assertValidChain(newChain);
    const { utxos, txHashes } = await this.replay(newChain);
    this.chain = newChain.map((block) => structuredClone(block));
    this.utxos = utxos;
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

  private async replay(blocks: Block[]): Promise<{ utxos: UtxoMap; txHashes: Set<string> }> {
    const utxos: UtxoMap = new Map();
    const txHashes = new Set<string>();
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!;
      await this.assertValidBlockContents(block, utxos, txHashes, {
        skipLinkChecks: i === 0,
        previous: i === 0 ? undefined : blocks[i - 1],
        expectedBits:
          i === 0
            ? this.config.initialBits
            : computeNextBits(blocks.slice(0, i), this.config, block.header.timestamp),
      });
      this.applyBlockToState(block, utxos, txHashes);
    }
    return { utxos, txHashes };
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
    txHashes: Set<string>,
  ): Promise<void> {
    await this.assertValidBlockContents(block, utxos, txHashes, {
      previous: this.latestBlock,
      expectedBits: computeNextBits(this.chain, this.config, block.header.timestamp),
    });
  }

  private async assertValidBlockContents(
    block: Block,
    utxos: UtxoMap,
    txHashes: Set<string>,
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
      if (txHashes.has(tx.hash)) {
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

  private applyBlockToState(block: Block, utxos: UtxoMap, txHashes: Set<string>): void {
    for (let i = 1; i < block.transactions.length; i++) {
      this.applyUserTransaction(block.transactions[i]!, utxos);
      txHashes.add(block.transactions[i]!.hash);
    }
    const coinbase = block.transactions[0]!;
    this.applyUserTransaction(coinbase, utxos);
    txHashes.add(coinbase.hash);
  }

  private async applyValidBlock(
    block: Block,
    options: { skipLinkChecks?: boolean } = {},
  ): Promise<void> {
    if (!options.skipLinkChecks) {
      await this.assertValidSuccessor(block, this.utxos, this.txHashes);
    } else {
      await this.assertValidBlockContents(block, this.utxos, this.txHashes, {
        skipLinkChecks: true,
        expectedBits: this.config.initialBits,
      });
    }
    this.commitBlock(block);
  }

  private commitBlock(block: Block): void {
    this.applyBlockToState(block, this.utxos, this.txHashes);
    this.chain.push(structuredClone(block));
  }
}
