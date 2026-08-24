import type { Transaction } from '../types.js';
import { ValidationError } from '../core/errors.js';
import { isCoinbaseTx, validateTransaction, type AccountSnapshot } from '../core/transaction.js';

interface MempoolEntry {
  tx: Transaction;
  addedAt: number;
}

export class Mempool {
  private entries = new Map<string, MempoolEntry>();

  constructor(private readonly ttlMs: number) {}

  get size(): number {
    this.pruneExpired();
    return this.entries.size;
  }

  get(hash: string): Transaction | undefined {
    return this.entries.get(hash)?.tx;
  }

  getAll(): Transaction[] {
    this.pruneExpired();
    return [...this.entries.values()].map((entry) => entry.tx);
  }

  add(
    tx: Transaction,
    getAccount: (address: string) => AccountSnapshot,
    alreadyInChain: (hash: string) => boolean,
  ): void {
    this.pruneExpired();
    if (isCoinbaseTx(tx)) {
      throw new ValidationError('Coinbase transactions cannot enter the mempool');
    }
    if (this.entries.has(tx.hash) || alreadyInChain(tx.hash)) {
      throw new ValidationError('Duplicate transaction');
    }

    const pendingBySender = this.pendingFor(tx.from);
    validateTransaction(tx, (address) => {
      if (address !== tx.from) return getAccount(address);
      const confirmed = getAccount(tx.from);
      const lastPending = pendingBySender[pendingBySender.length - 1];
      if (!lastPending) return confirmed;
      return {
        balance: confirmed.balance - this.reservedBy(pendingBySender),
        nonce: lastPending.nonce,
      };
    });

    this.entries.set(tx.hash, { tx, addedAt: Date.now() });
  }

  remove(hash: string): void {
    this.entries.delete(hash);
  }

  removeMany(hashes: Iterable<string>): void {
    for (const hash of hashes) {
      this.entries.delete(hash);
    }
  }

  /**
   * Select up to `limit` transactions, highest fee first, while preserving
   * per-sender nonce order.
   */
  selectForBlock(limit: number, getAccount: (address: string) => AccountSnapshot): Transaction[] {
    this.pruneExpired();
    const remaining = [...this.entries.values()].map((entry) => entry.tx);
    remaining.sort((a, b) => b.fee - a.fee || a.timestamp - b.timestamp);

    const included: Transaction[] = [];
    const nextNonce = new Map<string, number>();
    const spent = new Map<string, number>();

    for (const tx of remaining) {
      if (included.length >= limit) break;
      const confirmed = getAccount(tx.from);
      const expectedNonce = nextNonce.get(tx.from) ?? confirmed.nonce + 1;
      if (tx.nonce !== expectedNonce) continue;
      const alreadySpent = spent.get(tx.from) ?? 0;
      if (confirmed.balance - alreadySpent < tx.amount + tx.fee) continue;
      included.push(tx);
      nextNonce.set(tx.from, tx.nonce + 1);
      spent.set(tx.from, alreadySpent + tx.amount + tx.fee);
    }
    return included;
  }

  requeueValid(
    txs: Transaction[],
    getAccount: (address: string) => AccountSnapshot,
    alreadyInChain: (hash: string) => boolean,
  ): void {
    for (const tx of txs) {
      if (isCoinbaseTx(tx) || this.entries.has(tx.hash) || alreadyInChain(tx.hash)) continue;
      try {
        this.add(tx, getAccount, alreadyInChain);
      } catch {
        // Drop transactions that are no longer valid against the new tip.
      }
    }
  }

  private pendingFor(address: string): Transaction[] {
    return [...this.entries.values()]
      .map((entry) => entry.tx)
      .filter((tx) => tx.from === address)
      .sort((a, b) => a.nonce - b.nonce);
  }

  private reservedBy(pending: Transaction[]): number {
    return pending.reduce((sum, tx) => sum + tx.amount + tx.fee, 0);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [hash, entry] of this.entries) {
      if (now - entry.addedAt > this.ttlMs) {
        this.entries.delete(hash);
      }
    }
  }
}
