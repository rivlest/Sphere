import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BlockHeader } from '../types.js';
import type { Utxo } from '../core/transaction.js';

/**
 * Periodic UTXO + header snapshot so startup replays only blocks after this height.
 * Pruning old block bodies is a separate follow-up (new nodes still need history to verify).
 */
export const UTXO_SNAPSHOT_INTERVAL = 144;

export interface UtxoSnapshot {
  height: number;
  tipHash: string;
  work: string;
  headers: Array<{ hash: string; header: BlockHeader }>;
  utxos: Utxo[];
  txIndex: Array<[string, number]>;
  addressIndex: Array<[string, string[]]>;
}

export class FileUtxoSnapshotStore {
  constructor(private readonly dataDir: string) {}

  private get filePath(): string {
    return path.join(this.dataDir, 'utxo.snapshot.json');
  }

  async load(): Promise<UtxoSnapshot | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!isUtxoSnapshot(parsed)) return null;
      return parsed;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(snapshot: UtxoSnapshot): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, `${JSON.stringify(snapshot)}\n`);
    try {
      await unlink(this.filePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw error;
    }
    await rename(tmp, this.filePath);
  }

  async clearIfAfter(height: number): Promise<void> {
    const snap = await this.load();
    if (!snap || snap.height <= height) return;
    try {
      await unlink(this.filePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw error;
    }
  }
}

function isUtxoSnapshot(value: unknown): value is UtxoSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snap = value as UtxoSnapshot;
  return (
    Number.isInteger(snap.height) &&
    typeof snap.tipHash === 'string' &&
    typeof snap.work === 'string' &&
    Array.isArray(snap.headers) &&
    Array.isArray(snap.utxos) &&
    Array.isArray(snap.txIndex) &&
    Array.isArray(snap.addressIndex)
  );
}
