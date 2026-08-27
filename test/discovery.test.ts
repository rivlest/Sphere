import { describe, expect, it } from 'vitest';
import { parseBootstrapPeers, sphereDiscoveryCid } from '../src/network/discovery.js';

describe('bootstrap peer list', () => {
  it('accepts ws URLs and ignores junk', () => {
    expect(
      parseBootstrapPeers({
        peers: ['ws://192.0.2.1:6001', 'not-a-peer', 'ws://192.0.2.1:6001', 3],
      }),
    ).toEqual(['ws://192.0.2.1:6001']);
  });

  it('returns empty for missing or invalid JSON', () => {
    expect(parseBootstrapPeers(null)).toEqual([]);
    expect(parseBootstrapPeers({})).toEqual([]);
    expect(parseBootstrapPeers({ peers: 'ws://x' })).toEqual([]);
  });

  it('builds a stable discovery CID', async () => {
    const a = await sphereDiscoveryCid();
    const b = await sphereDiscoveryCid();
    expect(a.toString()).toBe(b.toString());
    expect(a.toString().length).toBeGreaterThan(10);
  });
});
