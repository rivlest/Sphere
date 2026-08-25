/** Smallest currency unit. 1 SPH = 100_000_000 Orbs. */
export const ORBS_PER_SPH = 100_000_000;

export const NETWORK_NAME = 'Sphere';
export const TICKER = 'SPH';
export const ADDRESS_PREFIX = 'sph1';
export const COINBASE_SENDER = 'COINBASE';
export const DEFAULT_FEE_SPH = '0.0001';
export const KEYSTORE_PBKDF2_ITERATIONS = 210_000;

export interface Transaction {
  from: string;
  to: string;
  amount: number;
  fee: number;
  nonce: number;
  timestamp: number;
  signature: string;
  hash: string;
}

export type UnsignedTransaction = Omit<Transaction, 'hash' | 'signature'> & {
  signature?: string;
  hash?: string;
};

export interface WalletSession {
  address: string;
  publicKey: string;
  privateKey: string;
}

export interface KeystoreFile {
  address: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface BalanceResponse {
  address: string;
  balance: number;
  balanceSph: string;
  nonce: number;
  nextNonce: number;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface PriceResponse {
  demo: true;
  source: 'simulated' | string;
  label: string;
  currency: string;
  price: number;
  change1hPercent: number;
  updatedAt: number;
  intervalMs: number;
  history: PricePoint[];
}

export interface AddressTransaction extends Transaction {
  status: 'confirmed' | 'pending';
  blockHeight?: number;
  blockHash?: string;
}

export interface NodeStatus {
  name: string;
  symbol: string;
  height: number;
  difficulty: number;
  peers: number;
  mining: boolean;
  mempool: number;
  latestHash: string;
}
