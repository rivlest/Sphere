import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Block } from '../types.js';
import {
  decodeBlock,
  decodeIndex,
  decodeRecord,
  encodeBlock,
  encodeIndex,
  encodeRecord,
  isAccountBasedSnapshot,
  type IndexEntry,
} from './codec.js';

/**
 * Persistence boundary. The default store is append-only binary (`chain.dat` + `chain.idx`).
 * `JsonFileChainStore` remains for one-shot JSON snapshots and migration.
 */
export interface ChainStore {
  load(): Promise<Block[] | null>;
  save(chain: Block[]): Promise<void>;
}

export class JsonFileChainStore implements ChainStore {
  constructor(private readonly dataDir: string) {}

  private get filePath(): string {
    return path.join(this.dataDir, 'chain.json');
  }

  async load(): Promise<Block[] | null> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('chain.json is not an array');
      }
      if (isAccountBasedSnapshot(parsed)) {
        throw new Error(
          'chain.json uses the pre-UTXO account format and cannot be loaded. Start a new data directory or run a dedicated migration if one is provided.',
        );
      }
      return parsed as Block[];
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(chain: Block[]): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, `${JSON.stringify(chain, null, 2)}\n`, 'utf8');
    try {
      await unlink(this.filePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw error;
    }
    await rename(tmp, this.filePath);
  }
}

export class BinaryChainStore implements ChainStore {
  constructor(private readonly dataDir: string) {}

  private get datPath(): string {
    return path.join(this.dataDir, 'chain.dat');
  }

  private get idxPath(): string {
    return path.join(this.dataDir, 'chain.idx');
  }

  private get jsonPath(): string {
    return path.join(this.dataDir, 'chain.json');
  }

  async load(): Promise<Block[] | null> {
    const fromBinary = await this.loadBinary();
    if (fromBinary) return fromBinary;

    try {
      const raw = await readFile(this.jsonPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('chain.json is not an array');
      }
      if (isAccountBasedSnapshot(parsed)) {
        throw new Error(
          'chain.json uses the pre-UTXO account format and cannot be loaded. Start a new data directory.',
        );
      }
      const blocks = parsed as Block[];
      await this.save(blocks);
      return blocks;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(chain: Block[]): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const existing = await this.readIndex();
    let fork = 0;
    while (fork < existing.length && fork < chain.length && existing[fork]!.hash === chain[fork]!.hash) {
      fork += 1;
    }

    if (fork === existing.length && fork === chain.length) {
      return;
    }

    if (fork < existing.length) {
      await this.truncateTo(fork, existing);
    }

    if (fork === 0 && existing.length === 0) {
      await writeFile(this.datPath, Buffer.alloc(0));
      await this.writeIndex([]);
    }

    for (let i = fork; i < chain.length; i++) {
      await this.appendBlock(chain[i]!);
    }
  }

  private async loadBinary(): Promise<Block[] | null> {
    let dat: Buffer;
    let idxBuf: Buffer;
    try {
      dat = await readFile(this.datPath);
      idxBuf = await readFile(this.idxPath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return null;
      throw error;
    }

    const index = decodeIndex(idxBuf);
    if (index.length === 0) return null;
    const blocks: Block[] = [];
    for (const entry of index) {
      const { payload, length } = decodeRecord(dat, entry.offset);
      if (length !== entry.length) {
        throw new Error(`Index length mismatch at offset ${entry.offset}`);
      }
      const block = decodeBlock(payload);
      if (block.hash !== entry.hash) {
        throw new Error('Index hash does not match block payload');
      }
      blocks.push(block);
    }
    return blocks;
  }

  private async readIndex(): Promise<IndexEntry[]> {
    try {
      return decodeIndex(await readFile(this.idxPath));
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return [];
      throw error;
    }
  }

  private async writeIndex(entries: IndexEntry[]): Promise<void> {
    const tmp = `${this.idxPath}.tmp`;
    await writeFile(tmp, encodeIndex(entries));
    try {
      await unlink(this.idxPath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw error;
    }
    await rename(tmp, this.idxPath);
  }

  private async truncateTo(count: number, existing: IndexEntry[]): Promise<void> {
    if (count === 0) {
      await writeFile(this.datPath, Buffer.alloc(0));
      await this.writeIndex([]);
      return;
    }
    const last = existing[count - 1]!;
    const end = last.offset + last.length;
    const handle = await open(this.datPath, 'r+');
    try {
      await handle.truncate(end);
    } finally {
      await handle.close();
    }
    await this.writeIndex(existing.slice(0, count));
  }

  private async appendBlock(block: Block): Promise<void> {
    const record = encodeRecord(encodeBlock(block));
    const handle = await open(this.datPath, 'a');
    let offset = 0;
    try {
      offset = (await handle.stat()).size;
      await handle.write(record);
    } finally {
      await handle.close();
    }
    const index = await this.readIndex();
    index.push({ offset, length: record.length, hash: block.hash });
    await this.writeIndex(index);
  }
}
