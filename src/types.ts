/** Smallest currency unit. 1 SPH = 100_000_000 Orbs. */
export const ORBS_PER_SPH = 100_000_000;

export const NETWORK_NAME = 'Sphere';
export const TICKER = 'SPH';
export const ADDRESS_PREFIX = 'sph1';
export const COINBASE_SENDER = 'COINBASE';

export interface BlockHeader {
  index: number;
  timestamp: number;
  previousHash: string;
  merkleRoot: string;
  nonce: number;
  difficulty: number;
  version: number;
}

export interface Block {
  header: BlockHeader;
  hash: string;
  transactions: Transaction[];
}

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

export interface Account {
  address: string;
  balance: number;
  nonce: number;
}

export interface ChainConfig {
  blockVersion: number;
  initialDifficulty: number;
  targetBlockTimeMs: number;
  difficultyAdjustmentInterval: number;
  maxDifficultyChangeFactor: number;
  maxTransactionsPerBlock: number;
  mempoolTtlMs: number;
  initialRewardOrbs: number;
  halvingInterval: number;
  genesisTimestamp: number;
  maxFutureBlockSkewMs: number;
}

export const DEFAULT_CONFIG: ChainConfig = {
  blockVersion: 1,
  // 3 leading hex zeros ≈ 4,096 hashes on average — fast locally, still a real PoW check.
  initialDifficulty: 3,
  targetBlockTimeMs: 600_000,
  difficultyAdjustmentInterval: 10,
  maxDifficultyChangeFactor: 4,
  maxTransactionsPerBlock: 500,
  mempoolTtlMs: 60 * 60 * 1000,
  initialRewardOrbs: 50 * ORBS_PER_SPH,
  halvingInterval: 210_000,
  // 2024-01-01T00:00:00.000Z — fixed genesis time (PoW is not required for index 0).
  genesisTimestamp: 1_704_067_200_000,
  maxFutureBlockSkewMs: 2 * 60 * 1000,
};

/**
 * Genesis coinbase recipient (public address only).
 * The matching private key must never appear in this repository.
 */
export const GENESIS_COINBASE_ADDRESS =
  'sph1d0301dcf451b9ecd36a431234b5460ad0f809158';

export type MessageType =
  | 'NEW_BLOCK'
  | 'NEW_TRANSACTION'
  | 'QUERY_CHAIN'
  | 'RESPONSE_CHAIN'
  | 'QUERY_PEERS'
  | 'RESPONSE_PEERS';

export type P2PMessage =
  | { type: 'NEW_BLOCK'; data: Block }
  | { type: 'NEW_TRANSACTION'; data: Transaction }
  | { type: 'QUERY_CHAIN' }
  | { type: 'RESPONSE_CHAIN'; data: Block[] }
  | { type: 'QUERY_PEERS' }
  | { type: 'RESPONSE_PEERS'; data: string[] };
