import { COINBASE_SENDER, type Transaction, type TxInput, type TxOutput } from '../types.js';
import { canonicalStringify, sha256Hex } from './hash.js';
import { isValidAddress } from '../wallet/keys.js';
import { ValidationError } from './errors.js';
import { addressFromPublicKey, recoverPublicKeyFromSignature, signHash } from '../wallet/keys.js';

export const COINBASE_TXID = '0'.repeat(64);

export interface Utxo {
  txid: string;
  vout: number;
  address: string;
  amount: number;
}

export function outpointKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

export function transactionPayload(tx: Pick<Transaction, 'inputs' | 'outputs' | 'timestamp'>): Record<string, unknown> {
  return {
    inputs: tx.inputs.map((input) => ({ txid: input.txid, vout: input.vout })),
    outputs: tx.outputs,
    timestamp: tx.timestamp,
  };
}

export function hashTransaction(tx: Pick<Transaction, 'inputs' | 'outputs' | 'timestamp'>): string {
  return sha256Hex(canonicalStringify(transactionPayload(tx)));
}

export function isCoinbaseTx(tx: Transaction): boolean {
  return tx.inputs.length === 1 && tx.inputs[0]!.txid === COINBASE_TXID;
}

export function outputSum(tx: Transaction): number {
  return tx.outputs.reduce((sum, output) => sum + output.amount, 0);
}

export function createCoinbaseTransaction(params: {
  to: string;
  amount: number;
  blockIndex: number;
  timestamp: number;
}): Transaction {
  const unsigned = {
    inputs: [{ txid: COINBASE_TXID, vout: params.blockIndex, signature: '' }],
    outputs: [{ address: params.to, amount: params.amount }],
    timestamp: params.timestamp,
  };
  const hash = hashTransaction(unsigned);
  return { ...unsigned, hash };
}

export function selectCoins(utxos: Utxo[], need: number): Utxo[] {
  const sorted = [...utxos].sort((a, b) => b.amount - a.amount);
  const selected: Utxo[] = [];
  let total = 0;
  for (const utxo of sorted) {
    if (total >= need) break;
    selected.push(utxo);
    total += utxo.amount;
  }
  if (total < need) {
    throw new ValidationError('Insufficient UTXO balance');
  }
  return selected;
}

export function createSignedTransaction(
  params: {
    utxos: Utxo[];
    to: string;
    amount: number;
    fee: number;
    changeAddress: string;
    timestamp?: number;
  },
  privateKey: string,
): Transaction {
  if (params.amount <= 0) {
    throw new ValidationError('Transaction amount must be greater than 0');
  }
  assertIntegerOrbs(params.amount, 'amount');
  assertIntegerOrbs(params.fee, 'fee');
  const selected = selectCoins(params.utxos, params.amount + params.fee);
  const totalIn = selected.reduce((sum, utxo) => sum + utxo.amount, 0);
  const change = totalIn - params.amount - params.fee;
  const outputs: TxOutput[] = [{ address: params.to, amount: params.amount }];
  if (change > 0) {
    outputs.push({ address: params.changeAddress, amount: change });
  }
  const unsigned = {
    inputs: selected.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout, signature: '' })),
    outputs,
    timestamp: params.timestamp ?? Date.now(),
  };
  const hash = hashTransaction(unsigned);
  const signature = signHash(hash, privateKey);
  const inputs: TxInput[] = unsigned.inputs.map((input) => ({ ...input, signature }));
  return { ...unsigned, inputs, hash };
}

export function assertIntegerOrbs(value: number, field: string): void {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative safe integer (Orbs)`);
  }
}

export function transactionFee(tx: Transaction, resolve: (txid: string, vout: number) => Utxo | undefined): number {
  if (isCoinbaseTx(tx)) return 0;
  let inputSum = 0;
  for (const input of tx.inputs) {
    const utxo = resolve(input.txid, input.vout);
    if (!utxo) throw new ValidationError(`Unknown input ${outpointKey(input.txid, input.vout)}`);
    inputSum += utxo.amount;
  }
  const fee = inputSum - outputSum(tx);
  if (fee < 0) throw new ValidationError('Outputs exceed inputs');
  return fee;
}

export function validateTransactionStructure(tx: Transaction): void {
  if (!Array.isArray(tx.inputs) || tx.inputs.length === 0) {
    throw new ValidationError('Transaction must have inputs');
  }
  if (!Array.isArray(tx.outputs) || tx.outputs.length === 0) {
    throw new ValidationError('Transaction must have outputs');
  }
  if (!Number.isInteger(tx.timestamp) || tx.timestamp <= 0) {
    throw new ValidationError('Invalid timestamp');
  }
  for (const output of tx.outputs) {
    if (!isValidAddress(output.address)) {
      throw new ValidationError('Invalid output address');
    }
    assertIntegerOrbs(output.amount, 'output amount');
  }
  if (hashTransaction(tx) !== tx.hash) {
    throw new ValidationError('Transaction hash mismatch');
  }
}

export function validateTransaction(
  tx: Transaction,
  resolve: (txid: string, vout: number) => Utxo | undefined,
): void {
  validateTransactionStructure(tx);

  if (isCoinbaseTx(tx)) {
    if (tx.inputs[0]!.signature !== '') {
      throw new ValidationError('Coinbase transaction must have an empty signature');
    }
    if (tx.outputs.length !== 1) {
      throw new ValidationError('Coinbase must have exactly one output');
    }
    return;
  }

  const seen = new Set<string>();
  for (const input of tx.inputs) {
    const key = outpointKey(input.txid, input.vout);
    if (seen.has(key)) {
      throw new ValidationError('Duplicate input in transaction');
    }
    seen.add(key);
    const utxo = resolve(input.txid, input.vout);
    if (!utxo) {
      throw new ValidationError(`Spent or missing UTXO ${key}`);
    }
    if (!input.signature) {
      throw new ValidationError('Missing signature');
    }
    try {
      const pub = recoverPublicKeyFromSignature(tx.hash, input.signature);
      if (addressFromPublicKey(pub) !== utxo.address) {
        throw new ValidationError('Invalid transaction signature');
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError('Invalid transaction signature');
    }
  }

  transactionFee(tx, resolve);
}

/** Wallet/API view of a transfer (payment output, not change). */
export function summarizeTransaction(
  tx: Transaction,
  resolve: (txid: string, vout: number) => Utxo | undefined,
): { from: string; to: string; amount: number; fee: number } {
  if (isCoinbaseTx(tx)) {
    const output = tx.outputs[0]!;
    return { from: COINBASE_SENDER, to: output.address, amount: output.amount, fee: 0 };
  }
  const first = resolve(tx.inputs[0]!.txid, tx.inputs[0]!.vout);
  const from = first?.address ?? 'unknown';
  const payment = tx.outputs.find((output) => output.address !== from) ?? tx.outputs[0]!;
  let fee = 0;
  try {
    fee = transactionFee(tx, resolve);
  } catch {
    fee = 0;
  }
  return { from, to: payment.address, amount: payment.amount, fee };
}

export function transactionTouchesAddress(
  tx: Transaction,
  address: string,
  resolve: (txid: string, vout: number) => Utxo | undefined,
): boolean {
  if (tx.outputs.some((output) => output.address === address)) return true;
  if (isCoinbaseTx(tx)) return false;
  return tx.inputs.some((input) => resolve(input.txid, input.vout)?.address === address);
}
