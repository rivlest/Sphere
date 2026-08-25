import { describe, expect, it, afterEach } from 'vitest';
import { createSignedTransaction } from '../src/core/transaction.js';
import { createWallet } from '../src/wallet/wallet.js';
import { startTestNode, waitFor } from './helpers.js';
import type { SphereNode } from '../src/node.js';

const nodes: SphereNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((node) => node.stop()));
});

describe('multi-node integration', () => {
  it('synchronizes blocks and transactions across three local nodes', async () => {
    const miner = createWallet();
    const nodeA = await startTestNode({ minerAddress: miner.address });
    nodes.push(nodeA);

    const mined = await nodeA.mineOneBlock();
    expect(mined.header.index).toBe(1);

    const nodeB = await startTestNode({
      peers: [`ws://127.0.0.1:${nodeA.p2pPort}`],
    });
    nodes.push(nodeB);

    await waitFor(() => nodeB.blockchain.height >= 1);
    expect(nodeB.blockchain.latestBlock.hash).toBe(nodeA.blockchain.latestBlock.hash);

    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: miner.address,
        to: alice.address,
        amount: 5_000_000,
        fee: 1000,
        nonce: 1,
      },
      miner.privateKey,
    );
    nodeA.submitTransaction(tx);

    await waitFor(() => nodeB.mempool.get(tx.hash) !== undefined);
    expect(nodeB.mempool.get(tx.hash)?.hash).toBe(tx.hash);

    const nodeC = await startTestNode({
      peers: [`ws://127.0.0.1:${nodeB.p2pPort}`],
    });
    nodes.push(nodeC);

    await waitFor(() => nodeC.blockchain.height >= 1);
    await waitFor(() => nodeC.mempool.get(tx.hash) !== undefined);

    const withTx = await nodeA.mineOneBlock();
    expect(withTx.transactions.some((item) => item.hash === tx.hash)).toBe(true);

    await waitFor(() => nodeB.blockchain.height >= 2);
    await waitFor(() => nodeC.blockchain.height >= 2);
    expect(nodeB.blockchain.latestBlock.hash).toBe(nodeA.blockchain.latestBlock.hash);
    expect(nodeC.blockchain.latestBlock.hash).toBe(nodeA.blockchain.latestBlock.hash);
    expect(nodeB.blockchain.getAccount(alice.address).balance).toBe(5_000_000);
    expect(nodeC.mempool.get(tx.hash)).toBeUndefined();
  }, 60_000);

  it('reloads the chain from disk after a restart', async () => {
    const node = await startTestNode();
    nodes.push(node);
    await node.mineOneBlock();
    const hash = node.blockchain.latestBlock.hash;
    const dataDir = node.dataDir;
    await node.stop();
    nodes.pop();

    const restarted = await startTestNode({ dataDir });
    nodes.push(restarted);
    expect(restarted.blockchain.height).toBe(1);
    expect(restarted.blockchain.latestBlock.hash).toBe(hash);
  }, 30_000);
});
