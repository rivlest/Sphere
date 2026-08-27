import type { Server } from 'node:http';
import type { Block, ChainConfig, Transaction } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { Blockchain } from './core/blockchain.js';
import { createCandidateBlock } from './core/block.js';
import { mineBlock } from './core/proofOfWork.js';
import { ValidationError } from './core/errors.js';
import { isCoinbaseTx, outpointKey, validateTransactionStructure, type Utxo } from './core/transaction.js';
import { isValidAddress } from './wallet/keys.js';
import { Mempool } from './mempool/mempool.js';
import { BinaryChainStore, type ChainStore } from './storage/persistence.js';
import { P2PNetwork, type PeerSocket, normalizePeerUrl } from './network/p2p.js';
import { DEFAULT_SEED_PEERS } from './network/seeds.js';
import { PeerBook, isPeerUrl } from './network/peerBook.js';
import { faucetFromEnv, type TestFaucet } from './api/faucet.js';
import { startApiServer } from './api/server.js';

export interface NodeOptions {
  httpPort: number;
  p2pPort: number;
  peers?: string[];
  mine?: boolean;
  minerAddress?: string;
  /** Public `ws://host:port` advertised to peers. Defaults to localhost. */
  advertisedP2pUrl?: string;
  /** Connect to DEFAULT_SEED_PEERS in addition to --peers. Default true. */
  useDefaultSeeds?: boolean;
  dataDir: string;
  config?: Partial<ChainConfig>;
  store?: ChainStore;
  silent?: boolean;
}

export class SphereNode {
  readonly config: ChainConfig;
  blockchain!: Blockchain;
  readonly mempool: Mempool;
  readonly p2p: P2PNetwork;
  readonly minerAddress?: string;
  readonly dataDir: string;
  private readonly store: ChainStore;
  private readonly bootstrapPeers: string[];
  private readonly shouldMine: boolean;
  private readonly silent: boolean;
  private readonly peerBook: PeerBook;
  private readonly faucet: TestFaucet | null;
  private peerRefresh: ReturnType<typeof setInterval> | null = null;
  private httpServer: Server | null = null;
  private mining = false;
  private mineAbort: AbortController | null = null;
  private persistQueue: Promise<void> = Promise.resolve();
  private chainLock: Promise<void> = Promise.resolve();
  httpPort = 0;
  p2pPort = 0;

  constructor(private readonly options: NodeOptions) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...options.config,
      pow: options.config?.pow ?? DEFAULT_CONFIG.pow,
    };
    this.store = options.store ?? new BinaryChainStore(options.dataDir);
    this.mempool = new Mempool(this.config.mempoolTtlMs);
    this.minerAddress = options.minerAddress;
    this.dataDir = options.dataDir;
    this.shouldMine = Boolean(options.mine);
    const extra = options.peers ?? [];
    const seeds = options.useDefaultSeeds === false ? [] : [...DEFAULT_SEED_PEERS];
    this.bootstrapPeers = [...new Set([...seeds, ...extra].map((url) => url.trim()).filter(Boolean))];
    this.silent = Boolean(options.silent);
    this.peerBook = new PeerBook(options.dataDir);
    this.faucet = faucetFromEnv();
    this.p2p = new P2PNetwork({
      silent: this.silent,
      dataDir: options.dataDir,
      lanDiscovery: !this.silent,
    });
  }

  get isMining(): boolean {
    return this.mining;
  }

  async start(): Promise<void> {
    await this.loadChain();
    await this.peerBook.load();
    this.bindP2P();

    this.p2pPort = await this.p2p.listen(this.options.p2pPort, {
      bootstrap: this.bootstrapPeers,
      announce: this.options.advertisedP2pUrl,
    });
    const advertised =
      this.options.advertisedP2pUrl?.replace(/\/$/, '') ?? `ws://127.0.0.1:${this.p2pPort}`;
    this.p2p.setAdvertisedUrl(advertised);
    const api = await startApiServer(this, this.options.httpPort);
    this.httpServer = api.server;
    this.httpPort = api.port;

    this.log(`REST API on http://127.0.0.1:${this.httpPort}`);
    this.log(`P2P on ${advertised}`);
    this.log(
      `height=${this.blockchain.height} bits=0x${this.blockchain.bits.toString(16)} work=${this.blockchain.difficulty}`,
    );

    const toDial = [...new Set([...this.bootstrapPeers, ...this.peerBook.list()])];
    for (const peer of toDial) {
      await this.tryDial(peer);
    }

    this.peerRefresh = setInterval(() => {
      void this.refreshPeers();
    }, 30_000);

    if (this.shouldMine) {
      this.startMining();
    }
  }

  async stop(): Promise<void> {
    this.stopMining();
    if (this.peerRefresh) {
      clearInterval(this.peerRefresh);
      this.peerRefresh = null;
    }
    await this.p2p.close();
    await new Promise<void>((resolve, reject) => {
      if (!this.httpServer) return resolve();
      this.httpServer.close((error) => (error ? reject(error) : resolve()));
    });
    this.httpServer = null;
    await this.persistQueue;
  }

  startMining(): void {
    if (this.mining) return;
    if (!this.minerAddress || !isValidAddress(this.minerAddress)) {
      throw new ValidationError('Mining requires a valid --miner-address');
    }
    this.mining = true;
    void this.miningLoop();
    this.log(`mining to ${this.minerAddress}`);
  }

  stopMining(): void {
    this.mining = false;
    this.mineAbort?.abort();
  }

  interruptMining(): void {
    this.mineAbort?.abort();
  }

  async mineOneBlock(): Promise<Block> {
    if (!this.minerAddress || !isValidAddress(this.minerAddress)) {
      throw new ValidationError('Mining requires a valid miner address');
    }
    const candidate = await this.buildCandidate();
    const mined = await mineBlock(candidate.header, { pow: this.config.pow });
    const block: Block = { ...candidate, header: mined.header, hash: mined.hash };
    await this.acceptLocalBlock(block);
    return block;
  }

  submitTransaction(raw: unknown): Transaction {
    const tx = raw as Transaction;
    validateTransactionStructure(tx);
    this.mempool.add(
      tx,
      (txid, vout) => this.blockchain.getUtxo(txid, vout),
      (hash) => this.blockchain.hasTransaction(hash),
    );
    this.p2p.broadcast({ type: 'NEW_TRANSACTION', data: tx });
    this.interruptMining();
    this.log(`tx ${tx.hash.slice(0, 12)}… accepted`);
    return tx;
  }

  getKnownPeers(): string[] {
    return this.knownPeerUrls();
  }

  async addPeer(url: string): Promise<void> {
    this.rememberPeer(url);
    await this.tryDial(url);
  }

  dripFaucet(to: string, amountOrbs: number): Transaction {
    if (!this.faucet) {
      throw new ValidationError('Faucet is disabled (set SPHERE_FAUCET_PRIVATE_KEY)');
    }
    const tx = this.faucet.drip(to, amountOrbs, this.spendableUtxos(this.faucet.fromAddress));
    return this.submitTransaction(tx);
  }

  private async loadChain(): Promise<void> {
    const snapshot = await this.store.load();
    try {
      this.blockchain = snapshot
        ? await Blockchain.open(this.config, snapshot)
        : await Blockchain.open(this.config);
    } catch (error) {
      throw new Error(`Failed to load chain snapshot: ${(error as Error).message}`);
    }
    if (!snapshot) {
      await this.persist();
      return;
    }
    this.log(`loaded ${snapshot.length} blocks from disk`);
  }

  private bindP2P(): void {
    this.p2p.on('block', (block: Block, from: PeerSocket) => {
      void this.onPeerBlock(block, from);
    });
    this.p2p.on('transaction', (tx: Transaction, from: PeerSocket) => {
      this.onPeerTransaction(tx, from);
    });
    this.p2p.on('chain', (chain: Block[]) => {
      void this.onPeerChain(chain);
    });
    this.p2p.on('queryChain', (from: PeerSocket) => {
      this.p2p.send(from, { type: 'RESPONSE_CHAIN', data: this.blockchain.getBlocks() });
      for (const tx of this.mempool.getAll()) {
        this.p2p.send(from, { type: 'NEW_TRANSACTION', data: tx });
      }
    });
    this.p2p.on('queryPeers', (from: PeerSocket) => {
      this.p2p.send(from, { type: 'RESPONSE_PEERS', data: this.knownPeerUrls() });
    });
    this.p2p.on('peers', (peers: string[]) => {
      void this.connectDiscovered(peers);
    });
    this.p2p.on('peerOpen', (from: PeerSocket) => {
      this.p2p.send(from, { type: 'QUERY_CHAIN' });
      this.p2p.send(from, { type: 'QUERY_PEERS' });
      this.p2p.send(from, { type: 'RESPONSE_PEERS', data: this.knownPeerUrls() });
    });
  }

  private knownPeerUrls(): string[] {
    return [...new Set([...this.p2p.getPeerUrls(), ...this.peerBook.list(), ...this.bootstrapPeers])];
  }

  private rememberPeer(url: string): void {
    if (!isPeerUrl(url)) return;
    const normalized = normalizePeerUrl(url);
    const advertised = this.p2p.getAdvertisedUrl();
    if (advertised && normalizePeerUrl(advertised) === normalized) return;
    if (this.peerBook.add(normalized)) {
      void this.peerBook.save();
    }
  }

  private async tryDial(url: string): Promise<void> {
    if (!isPeerUrl(url)) return;
    try {
      await this.p2p.connect(url);
      this.peerBook.markSuccess(url);
    } catch (error) {
      this.peerBook.markFailure(url);
      this.log(`failed to connect to ${url}: ${(error as Error).message}`);
    }
  }

  private async refreshPeers(): Promise<void> {
    for (const url of this.knownPeerUrls()) {
      await this.tryDial(url);
    }
    await this.peerBook.save();
  }

  private async connectDiscovered(peers: string[]): Promise<void> {
    for (const url of peers) {
      this.rememberPeer(url);
      await this.tryDial(url);
    }
  }

  private onPeerTransaction(tx: Transaction, from: PeerSocket): void {
    try {
      if (
        isCoinbaseTx(tx) ||
        this.mempool.get(tx.hash) ||
        this.blockchain.hasTransaction(tx.hash)
      ) {
        return;
      }
      this.mempool.add(
        tx,
        (txid, vout) => this.blockchain.getUtxo(txid, vout),
        (hash) => this.blockchain.hasTransaction(hash),
      );
      this.p2p.broadcast({ type: 'NEW_TRANSACTION', data: tx }, from);
      this.interruptMining();
    } catch {
      // Untrusted data: drop invalid transactions.
    }
  }

  private async onPeerBlock(block: Block, from: PeerSocket): Promise<void> {
    await this.withChain(async () => {
      if (this.blockchain.getBlockByHash(block.hash)) return;
      try {
        await this.blockchain.addBlock(block);
        this.afterAcceptedBlock(block, from);
        this.log(`accepted block #${block.header.index} ${block.hash.slice(0, 12)}… from peer`);
      } catch {
        if (block.header.index > this.blockchain.height) {
          this.p2p.send(from, { type: 'QUERY_CHAIN' });
        }
      }
    });
  }

  private async onPeerChain(chain: Block[]): Promise<void> {
    const applied = await this.withChain(async () => {
      if (!Array.isArray(chain) || chain.length <= this.blockchain.length) return null;
      const previous = this.blockchain.getBlocks();
      const fork = this.blockchain.forkIndex(chain);
      try {
        if (!(await this.blockchain.replaceChain(chain))) return null;
      } catch (error) {
        this.log(`rejected peer chain: ${(error as Error).message}`);
        return null;
      }
      return { previous, fork };
    });
    if (!applied) return;
    const { previous, fork } = applied;

    this.mempool.removeMany(collectTxHashes(chain));
    const orphaned = previous.slice(fork).flatMap((block) => block.transactions);
    this.mempool.requeueValid(
      orphaned,
      (txid, vout) => this.blockchain.getUtxo(txid, vout),
      (hash) => this.blockchain.hasTransaction(hash),
    );
    this.interruptMining();
    this.persist();
    this.log(`reorg to height ${this.blockchain.height}`);
  }

  private async acceptLocalBlock(block: Block): Promise<void> {
    await this.withChain(async () => {
      await this.blockchain.addBlock(block);
      this.afterAcceptedBlock(block);
      this.log(
        `mined block #${block.header.index} nonce=${block.header.nonce} ${block.hash.slice(0, 12)}…`,
      );
    });
  }

  private afterAcceptedBlock(block: Block, from?: PeerSocket): void {
    this.mempool.removeMany(block.transactions.map((tx) => tx.hash));
    this.interruptMining();
    this.p2p.broadcast({ type: 'NEW_BLOCK', data: block }, from);
    this.persist();
  }

  private async buildCandidate(): Promise<Block> {
    const userTxs = this.mempool.selectForBlock(
      this.config.maxTransactionsPerBlock - 1,
      (txid, vout) => this.blockchain.getUtxo(txid, vout),
    );
    return createCandidateBlock(this.blockchain, this.minerAddress!, userTxs);
  }

  private async miningLoop(): Promise<void> {
    while (this.mining) {
      this.mineAbort = new AbortController();
      try {
        const candidate = await this.buildCandidate();
        const mined = await mineBlock(candidate.header, {
          signal: this.mineAbort.signal,
          pow: this.config.pow,
        });
        if (!this.mining) break;
        const block: Block = { ...candidate, header: mined.header, hash: mined.hash };
        await this.acceptLocalBlock(block);
      } catch (error) {
        if (isAbortError(error)) continue;
        this.log(`mining error: ${(error as Error).message}`);
        await sleep(1000);
      }
    }
  }

  spendableUtxos(address: string): Utxo[] {
    const reserved = this.mempool.reservedOutpoints();
    return this.blockchain
      .getUtxos(address)
      .filter((utxo) => !reserved.has(outpointKey(utxo.txid, utxo.vout)));
  }

  private withChain<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chainLock.then(fn, fn);
    this.chainLock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private persist(): void {
    const snapshot = this.blockchain.getBlocks();
    this.persistQueue = this.persistQueue
      .then(() => this.store.save(snapshot))
      .catch((error: unknown) => {
        this.log(`persist failed: ${(error as Error).message}`);
      });
  }

  private log(message: string): void {
    if (!this.silent) {
      console.log(`[sphere] ${message}`);
    }
  }
}

function collectTxHashes(chain: Block[]): string[] {
  return chain.flatMap((block) => block.transactions.map((tx) => tx.hash));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
