import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { isPeerAddress } from './multiaddr.js';

/** Shared DHT key so Sphere nodes find each other without a dedicated seed VPS. */
export const SPHERE_NETWORK_NS = 'sphere-mainnet-v3';

/** Community peer list (same repo people already clone). Empty is valid. */
export const BOOTSTRAP_PEERS_URLS: readonly string[] = [
  'https://raw.githubusercontent.com/rivlest/Sphere/master/bootstrap-peers.json',
  'https://cdn.jsdelivr.net/gh/rivlest/Sphere@master/bootstrap-peers.json',
];

/** Public libp2p/IPFS bootstraps — used for DHT + circuit-relay, not as Sphere seeds. */
export const LIBP2P_BOOTSTRAP: readonly string[] = ['/dnsaddr/bootstrap.libp2p.io'];

let cachedCid: CID | undefined;

export async function sphereDiscoveryCid(): Promise<CID> {
  if (cachedCid) return cachedCid;
  const digest = await sha256.digest(new TextEncoder().encode(SPHERE_NETWORK_NS));
  cachedCid = CID.createV1(raw.code, digest);
  return cachedCid;
}

export function parseBootstrapPeers(body: unknown): string[] {
  if (!body || typeof body !== 'object' || !('peers' in body)) return [];
  const peers = (body as { peers: unknown }).peers;
  if (!Array.isArray(peers)) return [];
  const out: string[] = [];
  for (const item of peers) {
    if (typeof item === 'string' && isPeerAddress(item.trim())) {
      out.push(item.trim());
    }
  }
  return [...new Set(out)];
}

export async function fetchBootstrapPeers(
  urls: readonly string[] = BOOTSTRAP_PEERS_URLS,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) continue;
      return parseBootstrapPeers(await res.json());
    } catch {
      // try the next mirror
    }
  }
  return [];
}
