import { afterEach, describe, expect, it } from 'vitest';
import { faucetAddress } from '../src/core/genesis.js';
import { startTestNode } from './helpers.js';
import type { SphereNode } from '../src/node.js';

const nodes: SphereNode[] = [];

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

  it('includes nonce on GET /balance/:address', async () => {
    const node = await startTestNode();
    nodes.push(node);
    const address = faucetAddress();
    const res = await fetch(`http://127.0.0.1:${node.httpPort}/balance/${address}`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body.balance).toBeGreaterThan(0);
    expect(typeof body.nonce).toBe('number');
    expect(body.nextNonce).toBe(body.nonce + 1);
  });

  it('labels GET /price as simulated demo data', async () => {
    const node = await startTestNode();
    nodes.push(node);
    const res = await fetch(`http://127.0.0.1:${node.httpPort}/price`);
    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body.source).toBe('simulated');
    expect(body.label).toMatch(/demo/i);
    expect(body.price).toBeGreaterThan(0);
    expect(Array.isArray(body.history)).toBe(true);
    expect(body.history.length).toBeGreaterThan(0);
  });

  it('lists address transactions including genesis coinbase', async () => {
    const node = await startTestNode();
    nodes.push(node);
    const address = faucetAddress();
    const res = await fetch(`http://127.0.0.1:${node.httpPort}/transactions/${address}`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body.transactions.length).toBeGreaterThan(0);
    expect(body.transactions.some((tx: { to: string }) => tx.to === address)).toBe(true);
  });
});
