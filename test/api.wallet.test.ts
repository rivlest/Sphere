import { afterEach, describe, expect, it } from 'vitest';
import { resetCmcCache } from '../src/api/coinMarketCap.js';
import { faucetAddress } from '../src/core/genesis.js';
import { startTestNode } from './helpers.js';
import type { SphereNode } from '../src/node.js';
import { SPHERE_VERSION, sphereCoreLabel } from '../src/version.js';

const nodes: SphereNode[] = [];

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((node) => node.stop()));
});

describe('wallet-facing REST API', () => {
  it('returns CORS headers for browser clients', async () => {
    const node = await startTestNode();
    nodes.push(node);
    const res = await fetch(`http://127.0.0.1:${node.httpPort}/status`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('reports meshReady false when the node has no Sphere peers', async () => {
    const node = await startTestNode();
    nodes.push(node);
    const res = await fetch(`http://127.0.0.1:${node.httpPort}/status`);
    const body = await readJson<{
      meshReady: boolean;
      meshPeers: number;
      peers: number;
      version: string;
      outdated: boolean;
    }>(res);
    expect(body.meshReady).toBe(false);
    expect(body.meshPeers).toBe(0);
    expect(body.peers).toBe(0);
    expect(body.version).toBe(sphereCoreLabel(SPHERE_VERSION));
    expect(body.outdated).toBe(false);
  });

  it('returns spendable UTXOs on GET /balance/:address', async () => {
    const node = await startTestNode();
    nodes.push(node);
    const address = faucetAddress();
    const res = await fetch(`http://127.0.0.1:${node.httpPort}/balance/${address}`);
    const body = await readJson<{
      balance: number;
      utxos: Array<{ txid: string; vout: number; amount: number }>;
    }>(res);
    expect(res.ok).toBe(true);
    expect(body.balance).toBeGreaterThan(0);
    expect(body.utxos.length).toBeGreaterThan(0);
    expect(body.utxos.reduce((sum, utxo) => sum + utxo.amount, 0)).toBe(body.balance);
  });

  it('GET /market reports on-chain supply in CoinMarketCap layout', async () => {
    const previous = {
      slug: process.env.CMC_SLUG,
      id: process.env.CMC_ID,
      key: process.env.CMC_API_KEY,
      altKey: process.env.COINMARKETCAP_API_KEY,
    };
    delete process.env.CMC_SLUG;
    delete process.env.CMC_ID;
    delete process.env.CMC_API_KEY;
    delete process.env.COINMARKETCAP_API_KEY;
    resetCmcCache();
    const node = await startTestNode();
    nodes.push(node);
    try {
      const res = await fetch(`http://127.0.0.1:${node.httpPort}/market`);
      const body = await readJson<{
        symbol: string;
        listed: boolean;
        circulatingSupply: number;
        maxSupply: number;
        holders: number;
        marketCap: number | null;
        volume24h: number | null;
      }>(res);
      expect(res.ok).toBe(true);
      expect(body.symbol).toBe('SPH');
      expect(body.listed).toBe(false);
      expect(body.circulatingSupply).toBe(50);
      expect(body.maxSupply).toBeGreaterThan(20_999_999);
      expect(body.maxSupply).toBeLessThanOrEqual(21_000_000);
      expect(body.holders).toBeGreaterThanOrEqual(1);
      expect(body.marketCap).toBeNull();
      expect(body.volume24h).toBeNull();
    } finally {
      restoreEnv('CMC_SLUG', previous.slug);
      restoreEnv('CMC_ID', previous.id);
      restoreEnv('CMC_API_KEY', previous.key);
      restoreEnv('COINMARKETCAP_API_KEY', previous.altKey);
    }
  });

  it('GET /price is unavailable until a real market URL is configured', async () => {
    const previous = process.env.SPHERE_PRICE_URL;
    delete process.env.SPHERE_PRICE_URL;
    const node = await startTestNode();
    nodes.push(node);
    try {
      const res = await fetch(`http://127.0.0.1:${node.httpPort}/price`);
      const body = await readJson<{
        available: boolean;
        price: number | null;
        source: string | null;
      }>(res);
      expect(res.ok).toBe(true);
      expect(body.available).toBe(false);
      expect(body.price).toBeNull();
      expect(body.source).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.SPHERE_PRICE_URL;
      else process.env.SPHERE_PRICE_URL = previous;
    }
  });

  it('rate-limits POST /transactions', async () => {
    const node = await startTestNode();
    nodes.push(node);
    let last = 0;
    for (let i = 0; i < 13; i++) {
      const res = await fetch(`http://127.0.0.1:${node.httpPort}/transactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it('lists address transactions including genesis coinbase', async () => {
    const node = await startTestNode();
    nodes.push(node);
    const address = faucetAddress();
    const res = await fetch(`http://127.0.0.1:${node.httpPort}/transactions/${address}`);
    const body = await readJson<{ transactions: Array<{ to: string }> }>(res);
    expect(res.ok).toBe(true);
    expect(body.transactions.length).toBeGreaterThan(0);
    expect(body.transactions.some((tx) => tx.to === address)).toBe(true);
  });
});
