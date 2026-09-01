import type { Express, Response } from 'express';
import { Router } from 'express';
import { ValidationError } from '../core/errors.js';
import type { SphereNode } from '../node.js';
import { isValidAddress } from '../wallet/keys.js';
import { formatOrbsToSph } from '../core/units.js';
import { NETWORK_NAME, TICKER, type Transaction } from '../types.js';
import { summarizeTransaction, transactionTouchesAddress, type Utxo } from '../core/transaction.js';
import { buildMarketSnapshot } from './marketSnapshot.js';
import { marketPrice } from './marketPrice.js';
import { rateLimit } from './rateLimit.js';

export function createRoutes(node: SphereNode): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const latest = node.blockchain.latestBlock;
    const mesh = node.getMeshStatus();
    res.json({
      name: NETWORK_NAME,
      symbol: TICKER,
      height: node.blockchain.height,
      bits: node.blockchain.bits,
      difficulty: node.blockchain.difficulty,
      peers: mesh.peers,
      meshPeers: mesh.meshPeers,
      meshReady: mesh.meshReady,
      mining: node.isMining,
      mempool: node.mempool.size,
      latestHash: latest.hash,
      work: node.blockchain.cumulativeWork.toString(),
    });
  });

  router.get('/blocks', async (req, res) => {
    const from = parseInteger(req.query.from, 0);
    const limit = Math.min(parseInteger(req.query.limit, 20), 100);
    const blocks = await node.blockchain.getBlocksRange(from, limit);
    res.json({
      total: node.blockchain.length,
      from,
      blocks,
    });
  });

  router.get('/blocks/:hashOrHeight', async (req, res) => {
    const { hashOrHeight } = req.params;
    const block =
      /^\d+$/.test(hashOrHeight) && hashOrHeight.length < 12
        ? await node.blockchain.fetchBlock(Number(hashOrHeight))
        : await node.blockchain.fetchBlockByHash(hashOrHeight);
    if (!block) {
      res.status(404).json({ error: 'Block not found' });
      return;
    }
    res.json(block);
  });

  router.get('/balance/:address', (req, res) => {
    const { address } = req.params;
    if (!isValidAddress(address)) {
      res.status(400).json({ error: 'Invalid address' });
      return;
    }
    const spendable = node.spendableUtxos(address);
    const confirmed = node.blockchain.getAccount(address).balance;
    const spendableBalance = spendable.reduce((sum, utxo) => sum + utxo.amount, 0);
    res.json({
      address,
      balance: spendableBalance,
      confirmedBalance: confirmed,
      balanceSph: formatOrbsToSph(spendableBalance),
      utxos: spendable,
    });
  });

  router.get('/utxos/:address', (req, res) => {
    const { address } = req.params;
    if (!isValidAddress(address)) {
      res.status(400).json({ error: 'Invalid address' });
      return;
    }
    res.json({ address, utxos: node.spendableUtxos(address) });
  });

  router.get('/mempool', (_req, res) => {
    res.json({ transactions: node.mempool.getAll() });
  });

  router.get('/price', async (_req, res) => {
    res.json(await marketPrice.getQuote());
  });

  router.get('/market', async (_req, res) => {
    res.json(await buildMarketSnapshot(node));
  });

  router.get('/transactions/:address', async (req, res) => {
    const { address } = req.params;
    if (!isValidAddress(address)) {
      res.status(400).json({ error: 'Invalid address' });
      return;
    }
    const limit = Math.min(parseInteger(req.query.limit, 50), 200);
    const resolve = (txid: string, vout: number) => node.blockchain.resolveOutpoint(txid, vout);
    const confirmed = [];
    const length = node.blockchain.length;
    for (let height = 0; height < length; height++) {
      const block = await node.blockchain.fetchBlock(height);
      if (!block) continue;
      for (const tx of block.transactions) {
        const deep = await Promise.all(
          tx.inputs.map(async (input) => {
            const live = resolve(input.txid, input.vout);
            if (live) return live;
            return node.blockchain.resolveOutpointDeep(input.txid, input.vout);
          }),
        );
        const touches =
          tx.outputs.some((output) => output.address === address) ||
          deep.some((utxo) => utxo?.address === address);
        if (touches) {
          confirmed.push({
            ...decorateTx(tx, (txid, vout) => deep.find((item) => item?.txid === txid && item.vout === vout) ?? resolve(txid, vout)),
            status: 'confirmed' as const,
            blockHeight: block.header.index,
            blockHash: block.hash,
          });
        }
      }
    }
    const pending = node.mempool
      .getAll()
      .filter((tx) => transactionTouchesAddress(tx, address, resolve))
      .map((tx) => ({ ...decorateTx(tx, resolve), status: 'pending' as const }));
    const transactions = [...pending, ...confirmed.reverse()].slice(0, limit);
    res.json({ address, transactions });
  });

  router.post(
    '/transactions',
    rateLimit({ windowMs: 60_000, max: 12 }),
    (req, res) => {
    try {
      const tx = node.submitTransaction(req.body);
      res.status(201).json({ accepted: true, hash: tx.hash });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/faucet', (req, res) => {
    try {
      const address = req.body?.address;
      const amount = Number(req.body?.amountOrbs ?? 100_000_000);
      const tx = node.dripFaucet(address, amount);
      res.status(201).json({ accepted: true, hash: tx.hash });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/peers', (_req, res) => {
    res.json({ peers: node.getKnownPeers() });
  });

  router.post('/peers', async (req, res) => {
    try {
      const address = req.body?.address;
      if (typeof address !== 'string' || !address.startsWith('ws')) {
        res.status(400).json({ error: 'Expected { "address": "ws://host:port" }' });
        return;
      }
      await node.addPeer(address);
      res.status(201).json({ ok: true, peers: node.getKnownPeers() });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export function mountRoutes(app: Express, node: SphereNode): void {
  app.use(createRoutes(node));
}

function decorateTx(tx: Transaction, resolve: (txid: string, vout: number) => Utxo | undefined) {
  return { ...tx, ...summarizeTransaction(tx, resolve) };
}

function parseInteger(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal error';
  res.status(500).json({ error: message });
}
