import { COINBASE_SENDER, type Transaction } from '../types.js';
import { canonicalStringify, sha256Hex } from './hash.js';
import { isValidAddress } from '../wallet/keys.js';
import { verifyTransactionOwnership } from '../wallet/wallet.js';
import { ValidationError } from './errors.js';
import { signHash } from '../wallet/keys.js';

export type UnsignedTransaction = Omit<Transaction, 'hash' | 'signature'> & {
  signature?: string;
  hash?: string;
};

export function transactionPayload(tx: UnsignedTransaction): Record<string, unknown> {
  return {
    amount: tx.amount,
    fee: tx.fee,
    from: tx.from,
    nonce: tx.nonce,
    timestamp: tx.timestamp,
    to: tx.to,
  };
}

export function hashTransaction(tx: UnsignedTransaction): string {
  return sha256Hex(canonicalStringify(transactionPayload(tx)));
}

export function isCoinbaseTx(tx: Transaction): boolean {
  return tx.from === COINBASE_SENDER;
}

export function createCoinbaseTransaction(params: {
  to: string;
  amount: number;
  blockIndex: number;
  timestamp: number;
}): Transaction {
  const unsigned: UnsignedTransaction = {
    from: COINBASE_SENDER,
    to: params.to,
    amount: params.amount,
    fee: 0,
    nonce: params.blockIndex,
    timestamp: params.timestamp,
    signature: '',
  };
  const hash = hashTransaction(unsigned);
  return { ...unsigned, signature: '', hash };
}

export function createSignedTransaction(
  params: {
    from: string;
    to: string;
    amount: number;
    fee: number;
    nonce: number;
    timestamp?: number;
  },
  privateKey: string,
): Transaction {
  const unsigned: UnsignedTransaction = {
    from: params.from,
    to: params.to,
    amount: params.amount,
    fee: params.fee,
    nonce: params.nonce,
    timestamp: params.timestamp ?? Date.now(),
    signature: '',
  };
  const hash = hashTransaction(unsigned);
  const signature = signHash(hash, privateKey);
  return { ...unsigned, hash, signature };
}

export function assertIntegerOrbs(value: number, field: string): void {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative safe integer (Orbs)`);
  }
}

export interface AccountSnapshot {
  balance: number;
  nonce: number;
}

export function validateTransactionStructure(tx: Transaction): void {
  if (typeof tx.from !== 'string' || typeof tx.to !== 'string') {
    throw new ValidationError('Transaction addresses must be strings');
  }
  if (!isCoinbaseTx(tx) && !isValidAddress(tx.from)) {
    throw new ValidationError('Invalid sender address');
  }
  if (!isValidAddress(tx.to)) {
    throw new ValidationError('Invalid recipient address');
  }
  assertIntegerOrbs(tx.amount, 'amount');
  assertIntegerOrbs(tx.fee, 'fee');
  if (!Number.isInteger(tx.nonce) || tx.nonce < 0) {
    throw new ValidationError('Invalid nonce');
  }
  if (!Number.isInteger(tx.timestamp) || tx.timestamp <= 0) {
    throw new ValidationError('Invalid timestamp');
  }
  if (hashTransaction(tx) !== tx.hash) {
    throw new ValidationError('Transaction hash mismatch');
  }
}

export function validateTransaction(
  tx: Transaction,
  getAccount: (address: string) => AccountSnapshot,
  options: { requirePositiveAmount?: boolean } = {},
): void {
  validateTransactionStructure(tx);

  if (isCoinbaseTx(tx)) {
    if (tx.signature !== '') {
      throw new ValidationError('Coinbase transaction must have an empty signature');
    }
    if (tx.fee !== 0) {
      throw new ValidationError('Coinbase fee must be 0');
    }
    return;
  }

  if (options.requirePositiveAmount !== false && tx.amount <= 0) {
    throw new ValidationError('Transaction amount must be greater than 0');
  }
  if (!tx.signature) {
    throw new ValidationError('Missing signature');
  }
  if (!verifyTransactionOwnership(tx)) {
    throw new ValidationError('Invalid transaction signature');
  }

  const sender = getAccount(tx.from);
  if (sender.balance < tx.amount + tx.fee) {
    throw new ValidationError('Insufficient balance');
  }
  if (tx.nonce !== sender.nonce + 1) {
    throw new ValidationError(`Invalid nonce: expected ${sender.nonce + 1}, got ${tx.nonce}`);
  }
}
