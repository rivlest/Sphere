import { describe, expect, it } from 'vitest';
import {
  denyOutboundDial,
  ipv4InCidr,
  isDialablePeerAddress,
  isGossipablePeerAddress,
  isLoopbackAddress,
  isOnSameLan,
  isPrivateLanAddress,
  looksLikeBootstrapAddr,
} from '../src/network/gossip.js';

describe('gossip addresses', () => {
  it('drops loopback, unspecified, and RFC1918 listens', () => {
    expect(isLoopbackAddress('ws://127.0.0.1:6001')).toBe(true);
    expect(isGossipablePeerAddress('ws://127.0.0.1:6001')).toBe(false);
    expect(isGossipablePeerAddress('/ip4/0.0.0.0/tcp/6001/ws')).toBe(false);
    expect(isGossipablePeerAddress('ws://57.128.203.234:6001')).toBe(true);
    expect(isGossipablePeerAddress('ws://192.168.0.10:6001')).toBe(false);
    expect(isGossipablePeerAddress('ws://10.0.0.5:6001')).toBe(false);
    expect(isGossipablePeerAddress('/ip4/172.16.9.2/tcp/6001/ws')).toBe(false);
    expect(isGossipablePeerAddress('ws://100.64.1.2:6001')).toBe(false);
    expect(isGossipablePeerAddress('ws://169.254.1.1:6001')).toBe(false);
    expect(isGossipablePeerAddress('ws://miner.local:6001')).toBe(false);
  });

  it('gossips circuit-relay paths only when the hop is public', () => {
    const viaSeed =
      '/ip4/57.128.203.234/tcp/6001/ws/p2p/12D3KooWSEEDADDR000000000000000000000000000/p2p-circuit/p2p/12D3KooWMINERADDR0000000000000000000000000';
    const viaLan =
      '/ip4/192.168.0.10/tcp/6001/ws/p2p/12D3KooWSEEDADDR000000000000000000000000000/p2p-circuit/p2p/12D3KooWMINERADDR0000000000000000000000000';
    expect(isGossipablePeerAddress(viaSeed)).toBe(true);
    expect(isPrivateLanAddress(viaLan)).toBe(true);
    expect(isGossipablePeerAddress(viaLan)).toBe(false);
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

  it('dials loopback and public peers, not foreign LAN addresses', () => {
    expect(isDialablePeerAddress('ws://127.0.0.1:6001')).toBe(true);
    expect(isDialablePeerAddress('ws://57.128.203.234:6001')).toBe(true);
    expect(isDialablePeerAddress('ws://203.0.113.9:6001')).toBe(true);
    expect(denyOutboundDial('ws://203.0.113.9:6001')).toBe(false);
    expect(denyOutboundDial('/ip4/0.0.0.0/tcp/6001/ws')).toBe(true);
    expect(ipv4InCidr('192.168.0.20', '192.168.0.10/24')).toBe(true);
    expect(ipv4InCidr('192.168.1.20', '192.168.0.10/24')).toBe(false);
  });

  it('treats other RFC1918 hosts as undialable when they are not on this LAN', () => {
    const foreign = 'ws://10.255.254.253:6001';
    expect(isPrivateLanAddress(foreign)).toBe(true);
    if (!isOnSameLan(foreign)) {
      expect(isDialablePeerAddress(foreign)).toBe(false);
      expect(denyOutboundDial(foreign)).toBe(true);
    }
  });
});
