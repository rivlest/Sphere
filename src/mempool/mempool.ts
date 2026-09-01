import type { Transaction } from '../types.js';
import { ValidationError } from '../core/errors.js';
import {
  isCoinbaseTx,
  outpointKey,
  transactionFee,
  validateTransaction,
  type TxValidationContext,
  type Utxo,
} from '../core/transaction.js';

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

  reservedOutpoints(): Set<string> {
    this.pruneExpired();
    const reserved = new Set<string>();
    for (const entry of this.entries.values()) {
      for (const input of entry.tx.inputs) {
        reserved.add(outpointKey(input.txid, input.vout));
      }
    }
    return reserved;
  }

  add(
    tx: Transaction,
    resolve: (txid: string, vout: number) => Utxo | undefined,
    alreadyInChain: (hash: string) => boolean,
    context?: TxValidationContext,
  ): void {
    this.pruneExpired();
    if (isCoinbaseTx(tx)) {
      throw new ValidationError('Coinbase transactions cannot enter the mempool');
    }
    if (this.entries.has(tx.hash) || alreadyInChain(tx.hash)) {
      throw new ValidationError('Duplicate transaction');
    }

    const reserved = this.reservedOutpoints();
    for (const input of tx.inputs) {
      const key = outpointKey(input.txid, input.vout);
      if (reserved.has(key)) {
        throw new ValidationError(`UTXO already spent in mempool: ${key}`);
      }
    }

    validateTransaction(tx, resolve, context);
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
   * Select up to `limit` transactions, highest fee first.
   * Two transactions that spend the same outpoint cannot both be selected.
   */
  selectForBlock(
    limit: number,
    resolve: (txid: string, vout: number) => Utxo | undefined,
    context?: TxValidationContext,
  ): Transaction[] {
    this.pruneExpired();
    const remaining = [...this.entries.values()].map((entry) => entry.tx);
    remaining.sort((a, b) => {
      const feeB = safeFee(b, resolve);
      const feeA = safeFee(a, resolve);
      return feeB - feeA || a.timestamp - b.timestamp;
    });

    const included: Transaction[] = [];
    const spent = new Set<string>();

    for (const tx of remaining) {
      if (included.length >= limit) break;
      if (tx.inputs.some((input) => spent.has(outpointKey(input.txid, input.vout)))) {
        continue;
      }
      try {
        validateTransaction(tx, resolve, context);
      } catch {
        continue;
      }
      included.push(tx);
      for (const input of tx.inputs) {
        spent.add(outpointKey(input.txid, input.vout));
      }
    }
    return included;
  }

  requeueValid(
    txs: Transaction[],
    resolve: (txid: string, vout: number) => Utxo | undefined,
    alreadyInChain: (hash: string) => boolean,
    context?: TxValidationContext,
  ): void {
    for (const tx of txs) {
      if (isCoinbaseTx(tx) || this.entries.has(tx.hash) || alreadyInChain(tx.hash)) continue;
      try {
        this.add(tx, resolve, alreadyInChain, context);
      } catch {
        // Drop transactions that are no longer valid against the new tip.
      }
    }
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

function safeFee(tx: Transaction, resolve: (txid: string, vout: number) => Utxo | undefined): number {
  try {
    return transactionFee(tx, resolve);
  } catch {
    return 0;
  }
}
