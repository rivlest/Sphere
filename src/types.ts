import { GENESIS_BITS } from './core/bits.js';

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
  /** Compact unsigned target: 1 byte exponent + 3 byte mantissa (see `bitsToTarget`). */
  bits: number;
  version: number;
}

export interface Block {
  header: BlockHeader;
  hash: string;
  transactions: Transaction[];
}

export interface TxInput {
  txid: string;
  vout: number;
  signature: string;
}

export interface TxOutput {
  address: string;
  amount: number;
}

export interface Transaction {
  inputs: TxInput[];
  outputs: TxOutput[];
  timestamp: number;
  hash: string;
}

export interface Account {
  address: string;
  balance: number;
}

/** Consensus Argon2id parameters for the block-header PoW hash. Changing these is a hard fork. */
export interface PowParams {
  algorithm: 'argon2id';
  /** KiB of RAM per hash (argon2 `memoryCost`). */
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  hashLength: number;
  /** Fixed 16-byte UTF-8 salt. Never random — this is a consensus preimage, not a password hash. */
  salt: string;
}

export const DEFAULT_POW: PowParams = {
  algorithm: 'argon2id',
  memoryCost: 4096,
  timeCost: 1,
  parallelism: 1,
  hashLength: 32,
  salt: 'sphere-hdr-v2pad',
};

export interface ChainConfig {
  blockVersion: number;
  initialBits: number;
  /** 10-minute equilibrium spacing. Retarget steers the window average toward this. */
  targetBlockTimeMs: number;
  /** Apply the ×1.4 clamp toward the 10-minute target when the next index is a multiple of this. */
  retargetInterval: number;
  maxTransactionsPerBlock: number;
  mempoolTtlMs: number;
  initialRewardOrbs: number;
  halvingInterval: number;
  genesisTimestamp: number;
  maxFutureBlockSkewMs: number;
  pow: PowParams;
}

export const DEFAULT_CONFIG: ChainConfig = {
  blockVersion: 3,
  initialBits: GENESIS_BITS,
  targetBlockTimeMs: 600_000,
  // 144 × 10 min = 1 calendar day at the documented target. Actual wall time depends on hashrate.
  retargetInterval: 144,
  maxTransactionsPerBlock: 500,
  mempoolTtlMs: 60 * 60 * 1000,
  initialRewardOrbs: 50 * ORBS_PER_SPH,
  halvingInterval: 210_000,
  // 2026-08-25T00:00:00.000Z — UTXO + nBits + Argon2id genesis.
  genesisTimestamp: 1_787_616_000_000,
  maxFutureBlockSkewMs: 2 * 60 * 1000,
  pow: DEFAULT_POW,
};

/**
 * Genesis coinbase — project fund (public address only).
 * The matching private key is not in this repository (operator backup only).
 */
export const GENESIS_COINBASE_ADDRESS =
  'sph10252f9a9770a9c19606a2a72b776c59e7bb597c6';

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
