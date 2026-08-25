import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG, type ChainConfig } from '../src/types.js';
import { Blockchain } from '../src/core/blockchain.js';
import { createCandidateBlock } from '../src/core/block.js';
import { mineBlock } from '../src/core/proofOfWork.js';
import type { Block } from '../src/types.js';
import { SphereNode } from '../src/node.js';
import { faucetAddress } from '../src/core/genesis.js';

export const TEST_CONFIG: ChainConfig = {
  ...DEFAULT_CONFIG,
  initialDifficulty: 1,
};

export async function mineEmptyBlock(chain: Blockchain, minerAddress: string): Promise<Block> {
  const candidate = createCandidateBlock(chain, minerAddress, []);
  const mined = await mineBlock(candidate.header);
  const block: Block = { ...candidate, header: mined.header, hash: mined.hash };
  chain.addBlock(block);
  return block;
}

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sphere-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function startTestNode(
  overrides: Partial<ConstructorParameters<typeof SphereNode>[0]> = {},
): Promise<SphereNode> {
  const dataDir = overrides.dataDir ?? (await mkdtemp(path.join(os.tmpdir(), 'sphere-node-')));
  const node = new SphereNode({
    httpPort: 0,
    p2pPort: 0,
    dataDir,
    mine: false,
    minerAddress: faucetAddress(),
    silent: true,
    useDefaultSeeds: false,
    config: TEST_CONFIG,
    ...overrides,
  });
  await node.start();
  return node;
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
}
