import type { Block, ChainBatch, ChainConfig, HeaderBatch, HeaderEntry } from '../types.js';
import { hashBlockHeader } from '../core/proofOfWork.js';
import { meetsProofOfWork } from '../core/bits.js';

/** Blocks / headers per P2P response. Stays well under the frame cap even with full blocks. */
export const SYNC_BATCH_SIZE = 32;

/** Current Sphere sync protocol. Peers still accept `/sphere/sync/1.0.0`. */
export const SPHERE_SYNC_PROTOCOL_V2 = '/sphere/sync/2.0.0';

export function isChainBatch(data: unknown): data is ChainBatch {
  if (!data || typeof data !== 'object') return false;
  const value = data as ChainBatch;
  return (
    Number.isInteger(value.fromHeight) &&
    value.fromHeight >= 0 &&
    Array.isArray(value.blocks) &&
    typeof value.more === 'boolean'
  );
}

export function isHeaderBatch(data: unknown): data is HeaderBatch {
  if (!data || typeof data !== 'object') return false;
  const value = data as HeaderBatch;
  return (
    Number.isInteger(value.fromHeight) &&
    value.fromHeight >= 0 &&
    Array.isArray(value.headers) &&
    typeof value.more === 'boolean'
  );
}

export function isBlockArray(data: unknown): data is Block[] {
  return Array.isArray(data);
}

export function isBodyBatch(data: unknown): data is { blocks: Block[] } {
  return Boolean(data && typeof data === 'object' && Array.isArray((data as { blocks: unknown }).blocks));
}

export async function headerPoWValid(
  entry: HeaderEntry,
  config: ChainConfig,
): Promise<boolean> {
  if (entry.hash !== (await hashBlockHeader(entry.header, config.pow))) return false;
  return meetsProofOfWork(entry.hash, entry.header.bits);
}

