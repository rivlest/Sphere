import type { Transaction } from '../types.js';
import {
  addressFromPrivateKey,
  addressFromPublicKey,
  generatePrivateKey,
  getPublicKeyHex,
  isValidAddress,
  recoverPublicKeyFromSignature,
  signHash,
  verifyHashSignature,
} from './keys.js';

export interface Wallet {
  privateKey: string;
  publicKey: string;
  address: string;
}

export function createWallet(): Wallet {
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKeyHex(privateKey);
  const address = addressFromPublicKey(publicKey);
  return { privateKey, publicKey, address };
}

export function walletFromPrivateKey(privateKey: string): Wallet {
  const publicKey = getPublicKeyHex(privateKey);
  const address = addressFromPublicKey(publicKey);
  return { privateKey, publicKey, address };
}

export function signTransactionHash(hash: string, privateKey: string): string {
  return signHash(hash, privateKey);
}

export function verifyTransactionOwnership(tx: Transaction): boolean {
  if (!tx.signature) return false;
  try {
    const pub = recoverPublicKeyFromSignature(tx.hash, tx.signature);
    if (addressFromPublicKey(pub) !== tx.from) return false;
    return verifyHashSignature(tx.hash, tx.signature, pub);
  } catch {
    return false;
  }
}

export { addressFromPrivateKey, addressFromPublicKey, isValidAddress };
