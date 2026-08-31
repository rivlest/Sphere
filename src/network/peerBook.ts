import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isPrivateLanAddress } from './gossip.js';
import { isPeerAddress, normalizePeerAddress } from './multiaddr.js';

const MAX_FAILURES = 5;

export { isPeerAddress, isPeerAddress as isPeerUrl } from './multiaddr.js';

export class PeerBook {
  private urls = new Set<string>();
  private failures = new Map<string, number>();

  constructor(private readonly dataDir: string) {}

  private get filePath(): string {
    return path.join(this.dataDir, 'peers.json');
  }

  list(): string[] {
    return [...this.urls];
  }

  add(url: string): boolean {
    if (!isPeerAddress(url) || isPrivateLanAddress(url)) return false;
    const normalized = normalizePeerAddress(url);
    if (this.urls.has(normalized)) return false;
    this.urls.add(normalized);
    this.failures.delete(normalized);
    return true;
  }

  markSuccess(url: string): void {
    this.failures.delete(normalizePeerAddress(url));
  }

  markFailure(url: string): void {
    const normalized = normalizePeerAddress(url);
    const count = (this.failures.get(normalized) ?? 0) + 1;
    this.failures.set(normalized, count);
    if (count >= MAX_FAILURES) {
      this.urls.delete(normalized);
      this.failures.delete(normalized);
    }
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !('urls' in parsed)) return;
      const urls = (parsed as { urls: unknown }).urls;
      if (!Array.isArray(urls)) return;
      for (const url of urls) {
        if (typeof url === 'string') this.add(url);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw error;
    }
  }

  async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(
      this.filePath,
      `${JSON.stringify({ urls: this.list() }, null, 2)}\n`,
      'utf8',
    );
  }
}
