import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { BlockHeader, PowParams } from '../types.js';
import { DEFAULT_POW } from '../types.js';
import { mineBlock } from './proofOfWork.js';

export interface MinePoolOptions {
  signal?: AbortSignal;
  pow?: PowParams;
  workers?: number;
}

/**
 * Parallel Argon2id search: each worker owns a nonce residue class.
 * Falls back to the single-thread loop when workers === 1 (tests / tiny machines).
 */
export async function mineBlockParallel(
  header: BlockHeader,
  options: MinePoolOptions = {},
): Promise<{ header: BlockHeader; hash: string }> {
  const pow = options.pow ?? DEFAULT_POW;
  const requested = options.workers ?? Number(process.env.SPHERE_MINE_WORKERS ?? 0);
  const workers = Math.max(
    1,
    Math.min(
      16,
      requested > 0 ? Math.floor(requested) : Math.max(1, availableParallelism() - 1),
    ),
  );
  if (workers === 1) {
    return mineBlock(header, { signal: options.signal, pow });
  }

  return new Promise((resolve, reject) => {
    const pool: Worker[] = [];
    let settled = false;

    const finish = (err?: Error, result?: { header: BlockHeader; hash: string }) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      for (const worker of pool) {
        worker.postMessage('stop');
        void worker.terminate();
      }
      if (err) reject(err);
      else if (result) resolve(result);
    };

    const onAbort = () => finish(new DOMException('Mining aborted', 'AbortError'));
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const workerUrl = new URL('./mineWorker.ts', import.meta.url);
    for (let i = 0; i < workers; i++) {
      const worker = new Worker(workerUrl, {
        workerData: { header, pow, nonceStart: i, nonceStride: workers },
        execArgv: process.execArgv,
      });
      worker.on('message', (msg: { found?: boolean; nonce?: number; hash?: string; error?: string }) => {
        if (msg.error) {
          finish(new Error(msg.error));
          return;
        }
        if (msg.found && msg.nonce !== undefined && msg.hash) {
          finish(undefined, { header: { ...header, nonce: msg.nonce }, hash: msg.hash });
        }
      });
      worker.on('error', (error) => finish(error));
      pool.push(worker);
    }
  });
}
