import {
  addressFromPrivateKey,
  addressFromPublicKey,
  generatePrivateKey,
  getPublicKeyHex,
  isValidAddress,
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

export { addressFromPrivateKey, addressFromPublicKey, isValidAddress };
