/** Smallest currency unit. 1 SPH = 100_000_000 Orbs. */
export const ORBS_PER_SPH = 100_000_000;

export const NETWORK_NAME = 'Sphere';
export const TICKER = 'SPH';
export const ADDRESS_PREFIX = 'sph1';
export const COINBASE_SENDER = 'COINBASE';
export const DEFAULT_FEE_SPH = '0.0001';
export const KEYSTORE_PBKDF2_ITERATIONS = 210_000;

export interface TxInput {
  txid: string;
  vout: number;
  signature: string;
}

export interface TxOutput {
  address: string;
  amount: number;
}

export interface Utxo {
  txid: string;
  vout: number;
  address: string;
  amount: number;
}

export interface Transaction {
  inputs: TxInput[];
  outputs: TxOutput[];
  timestamp: number;
  hash: string;
  from?: string;
  to?: string;
  amount?: number;
  fee?: number;
}

export type UnsignedTransaction = Pick<Transaction, 'inputs' | 'outputs' | 'timestamp'> & {
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
  confirmedBalance?: number;
  balanceSph: string;
  utxos: Utxo[];
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface MarketSnapshot {
  name: string;
  symbol: string;
  listed: boolean;
  source: 'coinmarketcap' | 'onchain' | 'hybrid';
  cmcUrl: string | null;
  available: boolean;
  currency: string;
  price: number | null;
  change1hPercent: number | null;
  change24hPercent: number | null;
  change7dPercent: number | null;
  marketCap: number | null;
  fullyDilutedMarketCap: number | null;
  volume24h: number | null;
  rank: number | null;
  marketPairs: number | null;
  circulatingSupply: number;
  circulatingSupplyLabel: string;
  totalSupply: number;
  maxSupply: number;
  maxSupplyLabel: string;
  holders: number;
  height: number;
  history: PricePoint[];
  updatedAt: number;
  pollIntervalMs: number;
  error?: string;
}

export interface PriceResponse {
  available: boolean;
  source: string | null;
  currency: string;
  price: number | null;
  change1hPercent: number | null;
  updatedAt: number | null;
  pollIntervalMs: number;
  history: PricePoint[];
  error?: string;
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
  bits?: number;
  peers: number;
  mining: boolean;
  mempool: number;
  latestHash: string;
}
