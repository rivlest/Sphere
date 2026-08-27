import { describe, expect, it } from 'vitest';
import { isPeerAddress, listenMultiaddrs, toMultiaddrString, wsListenPort } from '../src/network/multiaddr.js';

describe('peer multiaddrs', () => {
  it('converts ws URLs to multiaddrs', () => {
    expect(toMultiaddrString('ws://57.128.203.234:6001')).toBe('/ip4/57.128.203.234/tcp/6001/ws');
    expect(toMultiaddrString('wss://seed.example:443')).toBe('/dns4/seed.example/tcp/443/wss');
    expect(isPeerAddress('/ip4/1.2.3.4/tcp/6001/ws')).toBe(true);
    expect(isPeerAddress('http://example.com')).toBe(false);
  });

  it('listens on WebSocket and native TCP', () => {
    expect(listenMultiaddrs(6001)).toEqual(['/ip4/0.0.0.0/tcp/6001/ws', '/ip4/0.0.0.0/tcp/6002']);
    expect(wsListenPort(['/ip4/127.0.0.1/tcp/4242/ws/p2p/12D3KooWabc'])).toBe(4242);
  });
});
