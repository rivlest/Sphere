import { describe, expect, it } from 'vitest';
import {
  isGossipablePeerAddress,
  isLoopbackAddress,
  looksLikeBootstrapAddr,
} from '../src/network/gossip.js';

describe('gossip addresses', () => {
  it('drops loopback and unspecified listens', () => {
    expect(isLoopbackAddress('ws://127.0.0.1:6001')).toBe(true);
    expect(isGossipablePeerAddress('ws://127.0.0.1:6001')).toBe(false);
    expect(isGossipablePeerAddress('/ip4/0.0.0.0/tcp/6001/ws')).toBe(false);
    expect(isGossipablePeerAddress('ws://57.128.203.234:6001')).toBe(true);
    expect(isGossipablePeerAddress('ws://192.168.0.10:6001')).toBe(true);
  });

  it('does not treat circuit-relay paths as the bootstrap seed', () => {
    const seeds = ['ws://57.128.203.234:6001'];
    expect(looksLikeBootstrapAddr('ws://57.128.203.234:6001', seeds)).toBe(true);
    expect(
      looksLikeBootstrapAddr(
        '/ip4/57.128.203.234/tcp/6001/ws/p2p/SEED/p2p-circuit/p2p/MINER',
        seeds,
      ),
    ).toBe(false);
  });
});
