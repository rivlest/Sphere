import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { ADDRESS_PREFIX, type Transaction, type UnsignedTransaction, type Utxo, type WalletSession } from '../types';
import { parseAddress } from './address';

secp.etc.hmacSha256Sync = (key, ...msgs) => hmac(sha256, key, secp.etc.concatBytes(...msgs));

export function sha256Hex(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? utf8ToBytes(data) : data;
  return bytesToHex(sha256(bytes));
}

/** Deterministic JSON with lexicographically sorted object keys — must match the Sphere node. */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(',');
  return `{${body}}`;
}

export function normalizePrivateKey(input: string): string {
  const hex = input.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error('Private key must be 32 bytes of hex');
  }
  if (!secp.utils.isValidPrivateKey(hexToBytes(hex))) {
    throw new Error('Invalid secp256k1 private key');
  }
  return hex;
}

export function generatePrivateKey(): string {
  return bytesToHex(secp.utils.randomPrivateKey());
}

export function getPublicKeyHex(privateKeyHex: string, compressed = true): string {
  const pub = secp.getPublicKey(hexToBytes(normalizePrivateKey(privateKeyHex)), compressed);
  return bytesToHex(pub);
}

export function addressFromPublicKey(publicKeyHex: string): string {
  return ADDRESS_PREFIX + sha256Hex(hexToBytes(publicKeyHex)).slice(0, 40);
}

export function addressFromPrivateKey(privateKeyHex: string): string {
  return addressFromPublicKey(getPublicKeyHex(privateKeyHex));
}

export function isValidAddress(address: string): boolean {
  try {
    parseAddress(address);
    return true;
  } catch {
    return false;
  }
}

export function normalizeAddress(address: string): string {
  try {
    return parseAddress(address).canonical;
  } catch {
    return address.trim();
  }
}

export function createWallet(): WalletSession {
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKeyHex(privateKey);
  return { privateKey, publicKey, address: addressFromPublicKey(publicKey) };
}

export function walletFromPrivateKey(privateKeyHex: string): WalletSession {
  const privateKey = normalizePrivateKey(privateKeyHex);
  const publicKey = getPublicKeyHex(privateKey);
  return { privateKey, publicKey, address: addressFromPublicKey(publicKey) };
}

export function transactionPayload(tx: UnsignedTransaction): Record<string, unknown> {
  return {
    inputs: tx.inputs.map((input) => ({ txid: input.txid, vout: input.vout })),
    outputs: tx.outputs,
    timestamp: tx.timestamp,
  };
}

export function hashTransaction(tx: UnsignedTransaction): string {
  return sha256Hex(canonicalStringify(transactionPayload(tx)));
}

/** ECDSA compact signature (64 bytes) + recovery id (1 byte), hex-encoded. */
export function signHash(messageHashHex: string, privateKeyHex: string): string {
  const msg = hexToBytes(messageHashHex);
  if (msg.length !== 32) {
    throw new Error('Message hash must be 32 bytes');
  }
  const signature = secp.sign(msg, hexToBytes(normalizePrivateKey(privateKeyHex)));
  const compact = signature.toCompactRawBytes();
  const packed = new Uint8Array(65);
  packed.set(compact, 0);
  packed[64] = signature.recovery;
  return bytesToHex(packed);
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
    throw new Error('Transaction amount must be greater than 0');
  }
  const to = parseAddress(params.to).canonical;
  const changeAddress = parseAddress(params.changeAddress).canonical;
  const selected = selectCoins(params.utxos, params.amount + params.fee);
  const totalIn = selected.reduce((sum, utxo) => sum + utxo.amount, 0);
  const change = totalIn - params.amount - params.fee;
  const outputs = [{ address: to, amount: params.amount }];
  if (change > 0) {
    outputs.push({ address: changeAddress, amount: change });
  }
  const unsigned: UnsignedTransaction = {
    inputs: selected.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout, signature: '' })),
    outputs,
    timestamp: params.timestamp ?? Date.now(),
  };
  const hash = hashTransaction(unsigned);
  const signature = signHash(hash, privateKey);
  return {
    ...unsigned,
    inputs: unsigned.inputs.map((input) => ({ ...input, signature })),
    hash,
  };
}

function selectCoins(utxos: Utxo[], need: number): Utxo[] {
  const sorted = [...utxos].sort((a, b) => b.amount - a.amount);
  const selected: Utxo[] = [];
  let total = 0;
  for (const utxo of sorted) {
    if (total >= need) break;
    selected.push(utxo);
    total += utxo.amount;
  }
  if (total < need) {
    throw new Error('Insufficient UTXO balance');
  }
  return selected;
}
