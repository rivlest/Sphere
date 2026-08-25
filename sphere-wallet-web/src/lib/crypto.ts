import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { ADDRESS_PREFIX, type Transaction, type UnsignedTransaction, type WalletSession } from '../types';

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
  return new RegExp(`^${ADDRESS_PREFIX}[0-9a-f]{40}$`).test(address.trim().toLowerCase());
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
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
