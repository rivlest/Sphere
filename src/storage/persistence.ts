import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Block } from '../types.js';

/**
 * Persistence boundary. Swap `JsonFileChainStore` for a LevelDB or SQLite
 * implementation later without changing `Blockchain` or the node wiring.
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
