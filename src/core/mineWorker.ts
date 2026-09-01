import { parentPort, workerData } from 'node:worker_threads';
import type { BlockHeader, PowParams } from '../types.js';
import { hashBlockHeader } from './proofOfWork.js';
import { meetsProofOfWork } from './bits.js';

const { header, pow, nonceStart, nonceStride } = workerData as {
  header: BlockHeader;
  pow: PowParams;
  nonceStart: number;
  nonceStride: number;
};

let stop = false;
parentPort?.on('message', (msg: unknown) => {
  if (msg === 'stop') stop = true;
});

async function run(): Promise<void> {
  for (let nonce = nonceStart; nonce <= Number.MAX_SAFE_INTEGER; nonce += nonceStride) {
    if (stop) {
      parentPort?.postMessage({ found: false });
      return;
    }
    const working = { ...header, nonce };
    const hash = await hashBlockHeader(working, pow);
    if (meetsProofOfWork(hash, working.bits)) {
      parentPort?.postMessage({ found: true, nonce, hash });
      return;
    }
  }
  parentPort?.postMessage({ found: false });
}

void run().catch((error: unknown) => {
  parentPort?.postMessage({ found: false, error: (error as Error).message });
});
