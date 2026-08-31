import type { Block, ChainBatch } from '../types.js';

/** Blocks per P2P chain response. Stays well under the frame cap even with full blocks. */
export const SYNC_BATCH_SIZE = 32;

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

export function isBlockArray(data: unknown): data is Block[] {
  return Array.isArray(data);
}
