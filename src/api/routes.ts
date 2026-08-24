import type { Express, Response } from 'express';
import { Router } from 'express';
import { ValidationError } from '../core/errors.js';
import type { SphereNode } from '../node.js';
import { isValidAddress } from '../wallet/keys.js';
import { formatOrbsToSph } from '../core/units.js';
import { NETWORK_NAME, TICKER } from '../types.js';

export function createRoutes(node: SphereNode): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const latest = node.blockchain.latestBlock;
    res.json({
      name: NETWORK_NAME,
      symbol: TICKER,
      height: node.blockchain.height,
      difficulty: node.blockchain.difficulty,
      peers: node.p2p.peerCount,
      mining: node.isMining,
      mempool: node.mempool.size,
      latestHash: latest.hash,
    });
  });

  router.get('/blocks', (req, res) => {
    const from = parseInteger(req.query.from, 0);
    const limit = Math.min(parseInteger(req.query.limit, 20), 100);
    const blocks = node.blockchain.getBlocks();
    res.json({
      total: blocks.length,
      from,
      blocks: blocks.slice(from, from + limit),
    });
  });

  router.get('/blocks/:hashOrHeight', (req, res) => {
    const { hashOrHeight } = req.params;
    const block =
      /^\d+$/.test(hashOrHeight) && hashOrHeight.length < 12
        ? node.blockchain.getBlockByHeight(Number(hashOrHeight))
        : node.blockchain.getBlockByHash(hashOrHeight);
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
    const account = node.blockchain.getAccount(address);
    const pending = node.mempool.getAll().filter((tx) => tx.from === address);
    const lastPendingNonce = pending.sort((a, b) => a.nonce - b.nonce).at(-1)?.nonce;
    res.json({
      address,
      balance: account.balance,
      balanceSph: formatOrbsToSph(account.balance),
      nonce: account.nonce,
      nextNonce: (lastPendingNonce ?? account.nonce) + 1,
    });
  });

  router.get('/mempool', (_req, res) => {
    res.json({ transactions: node.mempool.getAll() });
  });

  router.post('/transactions', (req, res) => {
    try {
      const tx = node.submitTransaction(req.body);
      res.status(201).json({ accepted: true, hash: tx.hash });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/peers', (_req, res) => {
    res.json({ peers: node.p2p.getPeerUrls() });
  });

  router.post('/peers', async (req, res) => {
    try {
      const address = req.body?.address;
      if (typeof address !== 'string' || !address.startsWith('ws')) {
        res.status(400).json({ error: 'Expected { "address": "ws://host:port" }' });
        return;
      }
      await node.addPeer(address);
      res.status(201).json({ ok: true, peers: node.p2p.getPeerUrls() });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export function mountRoutes(app: Express, node: SphereNode): void {
  app.use(createRoutes(node));
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
