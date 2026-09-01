import type { Server } from 'node:http';
import type { Block, BodyQuery, ChainConfig, ChainQuery, Transaction } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { Blockchain, BLOCK_CACHE_SIZE } from './core/blockchain.js';
import { createCandidateBlock } from './core/block.js';
import { mineBlockParallel } from './core/minePool.js';
import { mineBlock } from './core/proofOfWork.js';
import { ValidationError } from './core/errors.js';
import { isCoinbaseTx, outpointKey, validateTransactionStructure, type Utxo } from './core/transaction.js';
import { isValidAddress } from './wallet/keys.js';
import { Mempool } from './mempool/mempool.js';
import { BinaryChainStore, type ChainStore } from './storage/persistence.js';
import { FileUtxoSnapshotStore } from './storage/utxoSnapshot.js';
import { P2PNetwork, type PeerSocket, normalizePeerUrl } from './network/p2p.js';
import { DEFAULT_SEED_PEERS } from './network/seeds.js';
import { fetchBootstrapPeers, LIBP2P_BOOTSTRAP } from './network/discovery.js';
import {
  isDialablePeerAddress,
  isGossipablePeerAddress,
  looksLikeBootstrapAddr,
  MESH_READY_BOOTSTRAP_PEERS,
  MESH_READY_MESH_PEERS,
} from './network/gossip.js';
import { PeerBook, isPeerUrl } from './network/peerBook.js';
import { checkpointConflict, highestCheckpointAtOrBelow } from './network/checkpoints.js';
import { PeerScore } from './network/peerScore.js';
import { headerPoWValid, isBlockArray, isBodyBatch, isChainBatch, isHeaderBatch, SYNC_BATCH_SIZE } from './network/sync.js';
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
  /** Connect to compiled seeds, GitHub peer list, and public DHT. Default true. */
  useDefaultSeeds?: boolean;
  dataDir: string;
  config?: Partial<ChainConfig>;
  store?: ChainStore;
  /** Bind REST here. Default 127.0.0.1. Use `0.0.0.0` / `--public` on a seed. */
  rpcBind?: string;
  /** Convenience: bind REST on 0.0.0.0. */
  publicRpc?: boolean;
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
  private readonly peerScore = new PeerScore();
  private readonly rpcHost: string;
  private peerRefresh: ReturnType<typeof setInterval> | null = null;
  private httpServer: Server | null = null;
  private mining = false;
  private mineAbort: AbortController | null = null;
  private persistQueue: Promise<void> = Promise.resolve();
  private chainLock: Promise<void> = Promise.resolve();
  private inboundQueue: Promise<void> = Promise.resolve();
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
    this.rpcHost = options.publicRpc ? '0.0.0.0' : (options.rpcBind ?? '127.0.0.1');
    this.p2p = new P2PNetwork({
      silent: this.silent,
      dataDir: options.dataDir,
      lanDiscovery: !this.silent,
      internetDiscovery: options.useDefaultSeeds !== false && !this.silent,
      offerRelay: Boolean(options.advertisedP2pUrl),
    });
  }

  get isMining(): boolean {
    return this.mining;
  }

  async start(): Promise<void> {
    await this.loadChain();
    await this.peerBook.load();
    this.bindP2P();

    if (this.options.useDefaultSeeds !== false && !this.silent) {
      const listed = await fetchBootstrapPeers();
      for (const url of listed) {
        if (!this.bootstrapPeers.includes(url)) this.bootstrapPeers.push(url);
      }
    }

    const listenBootstrap = [
      ...this.bootstrapPeers,
      ...(this.options.useDefaultSeeds !== false && !this.silent ? LIBP2P_BOOTSTRAP : []),
    ];
    this.p2pPort = await this.p2p.listen(this.options.p2pPort, {
      bootstrap: listenBootstrap,
      announce: this.options.advertisedP2pUrl,
    });
    const advertised =
      this.options.advertisedP2pUrl?.replace(/\/$/, '') ?? `ws://127.0.0.1:${this.p2pPort}`;
    this.p2p.setAdvertisedUrl(advertised);
    const api = await startApiServer(this, this.options.httpPort, this.rpcHost);
    this.httpServer = api.server;
    this.httpPort = api.port;

    this.log(`REST API on http://${this.rpcHost === '0.0.0.0' ? '127.0.0.1' : this.rpcHost}:${this.httpPort}`);
    this.log(`P2P on ${advertised}`);
    this.log(
      `height=${this.blockchain.height} bits=0x${this.blockchain.bits.toString(16)} work=${this.blockchain.difficulty}`,
    );

    const toDial = [...new Set([...this.bootstrapPeers, ...this.peerBook.list()])];
    for (const peer of toDial) {
      await this.tryDial(peer);
    }

    void this.p2p.advertiseSphere();
    void this.p2p.findSpherePeers();

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
    return this.gossipPeerUrls();
  }

  getMeshStatus(): { peers: number; meshPeers: number; meshReady: boolean } {
    const peers = this.p2p.peerCount;
    const meshPeers = this.p2p
      .sphereConnectionAddrs()
      .filter((addr) => !looksLikeBootstrapAddr(addr, this.bootstrapPeers)).length;
    const advertised = this.p2p.getAdvertisedUrl();
    const iAmBootstrap = Boolean(
      advertised && looksLikeBootstrapAddr(advertised, this.bootstrapPeers),
    );
    const meshReady = iAmBootstrap
      ? peers >= MESH_READY_BOOTSTRAP_PEERS
      : meshPeers >= MESH_READY_MESH_PEERS;
    return { peers, meshPeers, meshReady };
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
    try {
      if (this.store instanceof BinaryChainStore) {
        this.blockchain = await Blockchain.openArchive(
          this.config,
          this.store,
          BLOCK_CACHE_SIZE,
          new FileUtxoSnapshotStore(this.dataDir),
        );
      } else {
        const snapshot = await this.store.load();
        this.blockchain = snapshot
          ? await Blockchain.open(this.config, snapshot)
          : await Blockchain.open(this.config);
        if (!snapshot) await this.persist();
      }
    } catch (error) {
      throw new Error(`Failed to load chain snapshot: ${(error as Error).message}`);
    }
    this.log(`loaded ${this.blockchain.length} blocks from disk`);
  }

  private bindP2P(): void {
    this.p2p.on('block', (block: Block, from: PeerSocket) => {
      void this.onPeerBlock(block, from);
    });
    this.p2p.on('transaction', (tx: Transaction, from: PeerSocket) => {
      this.enqueueInbound(() => this.onPeerTransaction(tx, from));
    });
    this.p2p.on('chain', (data: unknown, from: PeerSocket) => {
      this.enqueueInbound(() => this.onPeerChainData(data, from));
    });
    this.p2p.on('queryChain', (from: PeerSocket, query?: ChainQuery) => {
      void this.respondChain(from, query);
    });
    this.p2p.on('queryHeaders', (from: PeerSocket, query?: ChainQuery) => {
      void this.respondHeaders(from, query);
    });
    this.p2p.on('headers', (data: unknown, from: PeerSocket) => {
      this.enqueueInbound(() => this.onPeerHeaders(data, from));
    });
    this.p2p.on('queryBodies', (from: PeerSocket, query: BodyQuery) => {
      void this.respondBodies(from, query);
    });
    this.p2p.on('bodies', (data: unknown, from: PeerSocket) => {
      this.enqueueInbound(() => this.onPeerBodies(data, from));
    });
    this.p2p.on('queryPeers', (from: PeerSocket) => {
      this.p2p.send(from, { type: 'RESPONSE_PEERS', data: this.gossipPeerUrls() });
    });
    this.p2p.on('peers', (peers: string[]) => {
      void this.connectDiscovered(peers);
    });
    this.p2p.on('peerOpen', (from: PeerSocket) => {
      const fromHeight = this.blockchain.height + 1;
      if (from.syncVersion >= 2) {
        this.p2p.send(from, { type: 'QUERY_HEADERS', data: { fromHeight } });
      } else {
        this.p2p.send(from, { type: 'QUERY_CHAIN', data: { fromHeight } });
      }
      this.p2p.send(from, { type: 'QUERY_PEERS' });
      this.p2p.send(from, { type: 'RESPONSE_PEERS', data: this.gossipPeerUrls() });
    });
  }

  private async respondChain(from: PeerSocket, query?: ChainQuery): Promise<void> {
    const fromHeight = Math.max(0, Math.floor(query?.fromHeight ?? 0));
    const blocks = await this.blockchain.getBlocksRange(fromHeight, SYNC_BATCH_SIZE);
    const more = fromHeight + blocks.length < this.blockchain.length;
    this.p2p.send(from, { type: 'RESPONSE_CHAIN', data: { fromHeight, blocks, more } });
    if (!more) this.flushMempoolTo(from);
  }

  private async respondHeaders(from: PeerSocket, query?: ChainQuery): Promise<void> {
    const fromHeight = Math.max(0, Math.floor(query?.fromHeight ?? 0));
    const headers = [];
    const end = Math.min(this.blockchain.length, fromHeight + SYNC_BATCH_SIZE);
    for (let height = fromHeight; height < end; height++) {
      const record = this.blockchain.getHeader(height);
      if (record) headers.push(record);
    }
    const more = fromHeight + headers.length < this.blockchain.length;
    this.p2p.send(from, { type: 'RESPONSE_HEADERS', data: { fromHeight, headers, more } });
  }

  private async respondBodies(from: PeerSocket, query: BodyQuery): Promise<void> {
    const hashes = Array.isArray(query?.hashes) ? query.hashes.slice(0, SYNC_BATCH_SIZE) : [];
    const blocks: Block[] = [];
    for (const hash of hashes) {
      const block = await this.blockchain.fetchBlockByHash(hash);
      if (block) blocks.push(block);
    }
    this.p2p.send(from, { type: 'RESPONSE_BODIES', data: { blocks } });
    if (hashes.length < SYNC_BATCH_SIZE) this.flushMempoolTo(from);
  }

  private flushMempoolTo(from: PeerSocket): void {
    for (const tx of this.mempool.getAll()) {
      this.p2p.send(from, { type: 'NEW_TRANSACTION', data: tx });
    }
  }

  private async onPeerHeaders(data: unknown, from: PeerSocket): Promise<void> {
    if (this.peerScore.isBanned(from.id) || !isHeaderBatch(data)) return;
    const wanted: string[] = [];
    let prevHash =
      data.fromHeight === 0 ? undefined : this.blockchain.hashAt(data.fromHeight - 1);
    for (const entry of data.headers) {
      const conflict = checkpointConflict(entry.header.index, entry.hash);
      if (conflict || !(await headerPoWValid(entry, this.config))) {
        this.notePeerInvalid(from, conflict ?? 'invalid header PoW');
        return;
      }
      if (prevHash !== undefined && entry.header.previousHash !== prevHash) {
        this.notePeerInvalid(from, 'header previousHash mismatch');
        return;
      }
      const have = this.blockchain.hashAt(entry.header.index);
      if (have === entry.hash) {
        prevHash = entry.hash;
        continue;
      }
      if (have && have !== entry.hash) {
        const locked = highestCheckpointAtOrBelow(this.blockchain.height);
        if (locked >= 0 && entry.header.index <= locked) {
          this.notePeerInvalid(from, 'header fork below checkpoint');
          return;
        }
      }
      wanted.push(entry.hash);
      prevHash = entry.hash;
    }
    if (wanted.length > 0) {
      this.p2p.send(from, { type: 'QUERY_BODIES', data: { hashes: wanted } });
    } else if (data.more) {
      this.p2p.send(from, {
        type: 'QUERY_HEADERS',
        data: { fromHeight: data.fromHeight + data.headers.length },
      });
    }
  }

  private async onPeerBodies(data: unknown, from: PeerSocket): Promise<void> {
    if (this.peerScore.isBanned(from.id) || !isBodyBatch(data)) return;
    if (data.blocks.length === 0) return;
    await this.onChainBatch(
      { fromHeight: data.blocks[0]!.header.index, blocks: data.blocks, more: false },
      from,
    );
    this.requestSync(from);
  }

  private gossipPeerUrls(): string[] {
    return [
      ...new Set([
        ...this.p2p.gossipAddresses(),
        ...this.peerBook.list().filter((url) => isGossipablePeerAddress(url)),
        ...this.bootstrapPeers.filter((url) => isGossipablePeerAddress(url)),
      ]),
    ];
  }

  private knownPeerUrls(): string[] {
    return [...new Set([...this.gossipPeerUrls(), ...this.peerBook.list(), ...this.bootstrapPeers])];
  }

  private rememberPeer(url: string): void {
    if (!isPeerUrl(url) || !isGossipablePeerAddress(url)) return;
    const normalized = normalizePeerUrl(url);
    const advertised = this.p2p.getAdvertisedUrl();
    if (advertised && normalizePeerUrl(advertised) === normalized) return;
    if (this.peerBook.add(normalized)) {
      void this.peerBook.save();
    }
  }

  private notePeerInvalid(from: PeerSocket, reason: string): void {
    const banned = this.peerScore.noteInvalid(from.id);
    this.log(`peer ${from.id.slice(0, 12)}… ${reason}${banned ? ' (banned)' : ''}`);
  }

  private async tryDial(url: string): Promise<void> {
    if (!isPeerUrl(url) || !isDialablePeerAddress(url)) return;
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
    await this.p2p.advertiseSphere();
    await this.p2p.findSpherePeers();
    await this.peerBook.save();
  }

  private async connectDiscovered(peers: string[]): Promise<void> {
    for (const url of peers) {
      this.rememberPeer(url);
      await this.tryDial(url);
    }
  }

  private onPeerTransaction(tx: Transaction, from: PeerSocket): void {
    if (this.peerScore.isBanned(from.id)) return;
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
      this.peerScore.noteValid(from.id);
    } catch {
      this.notePeerInvalid(from, 'invalid transaction');
    }
  }

  private async onPeerBlock(block: Block, from: PeerSocket): Promise<void> {
    if (this.peerScore.isBanned(from.id)) return;
    const conflict = checkpointConflict(block.header.index, block.hash);
    if (conflict) {
      this.notePeerInvalid(from, conflict);
      return;
    }
    await this.withChain(async () => {
      if (this.blockchain.hasBlockHash(block.hash)) return;
      try {
        await this.blockchain.addBlock(block);
        this.afterAcceptedBlock(block, from);
        this.peerScore.noteValid(from.id);
        this.log(`accepted block #${block.header.index} ${block.hash.slice(0, 12)}… from peer`);
      } catch {
        this.notePeerInvalid(from, `rejected block #${block.header.index}`);
        if (block.header.index > this.blockchain.height) {
          if (from.syncVersion >= 2) {
            this.p2p.send(from, {
              type: 'QUERY_HEADERS',
              data: { fromHeight: this.blockchain.height + 1 },
            });
          } else {
            this.p2p.send(from, {
              type: 'QUERY_CHAIN',
              data: { fromHeight: this.blockchain.height + 1 },
            });
          }
        }
      }
    });
  }

  private async onPeerChainData(data: unknown, from: PeerSocket): Promise<void> {
    if (isChainBatch(data)) {
      await this.onChainBatch(data, from);
      return;
    }
    if (isBlockArray(data)) {
      await this.onChainBatch(
        { fromHeight: data[0]?.header.index ?? 0, blocks: data, more: false },
        from,
      );
    }
  }

  private async onChainBatch(
    batch: { fromHeight: number; blocks: Block[]; more: boolean },
    from: PeerSocket,
  ): Promise<void> {
    if (this.peerScore.isBanned(from.id)) return;
    const advanced = await this.withChain(async () => {
      let applied = 0;
      let height = batch.fromHeight;
      for (const block of batch.blocks) {
        if (block.header.index !== height) {
          this.log(`ignored misindexed peer block at ${height}`);
          break;
        }
        const conflict = checkpointConflict(block.header.index, block.hash);
        if (conflict) {
          this.notePeerInvalid(from, conflict);
          break;
        }
        const have = this.blockchain.hashAt(height);
        if (have === block.hash) {
          height += 1;
          continue;
        }
        if (have && have !== block.hash) {
          if (height === 0) {
            this.log('rejected peer chain: different genesis');
            return 0;
          }
          const locked = highestCheckpointAtOrBelow(this.blockchain.height);
          if (locked >= 0 && height <= locked) {
            this.notePeerInvalid(from, 'fork below checkpoint');
            return 0;
          }
          await this.blockchain.rewindTo(height - 1);
        }
        if (block.header.index !== this.blockchain.height + 1) {
          this.requestSync(from);
          return applied;
        }
        try {
          await this.blockchain.addBlock(block);
        } catch (error) {
          this.notePeerInvalid(from, `rejected peer block #${block.header.index}`);
          this.log(`rejected peer block #${block.header.index}: ${(error as Error).message}`);
          break;
        }
        this.mempool.removeMany(block.transactions.map((tx) => tx.hash));
        applied += 1;
        height += 1;
      }
      if (applied > 0) {
        this.peerScore.noteValid(from.id);
        this.interruptMining();
        this.persist();
        const tip = this.blockchain.latestBlock;
        this.p2p.broadcast({ type: 'NEW_BLOCK', data: tip }, from);
        this.log(`synced to height ${this.blockchain.height}`);
      }
      return applied;
    });

    if (batch.more || (advanced === 0 && batch.blocks.length > 0 && batch.fromHeight > this.blockchain.height + 1)) {
      this.requestSync(from);
    }
  }

  private requestSync(from: PeerSocket): void {
    const fromHeight = this.blockchain.height + 1;
    if (from.syncVersion >= 2) {
      this.p2p.send(from, { type: 'QUERY_HEADERS', data: { fromHeight } });
    } else {
      this.p2p.send(from, { type: 'QUERY_CHAIN', data: { fromHeight } });
    }
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
        const mined = await mineBlockParallel(candidate.header, {
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

  private enqueueInbound(work: () => Promise<void> | void): void {
    this.inboundQueue = this.inboundQueue
      .then(work)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  private persist(): void {
    if (this.store instanceof BinaryChainStore) return;
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

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
