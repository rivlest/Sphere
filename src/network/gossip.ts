import { isPeerAddress, normalizePeerAddress, stripPeerId } from './multiaddr.js';

/** Bootstrap node: enough miners connected here. */
export const MESH_READY_BOOTSTRAP_PEERS = 3;
/** Miner: Sphere connections that are not the bootstrap seed. */
export const MESH_READY_MESH_PEERS = 2;

export function isLoopbackAddress(addr: string): boolean {
  const value = addr.toLowerCase();
  return (
    /127\.0\.0\.1/.test(value) ||
    /\/ip4\/127\./.test(value) ||
    /\[::1\]/.test(value) ||
    /\/ip6\/::1\b/.test(value) ||
    /localhost/.test(value)
  );
}

export function isUnspecifiedListen(addr: string): boolean {
  const value = addr.toLowerCase();
  return /\/ip4\/0\.0\.0\.0\b/.test(value) || /\/ip6\/::(\/|$)/.test(value);
}

/** Addresses worth telling other miners about. Never loopback or 0.0.0.0. */
export function isGossipablePeerAddress(addr: string): boolean {
  if (!isPeerAddress(addr) || addr.length > 1024) return false;
  if (isLoopbackAddress(addr)) return false;
  if (isUnspecifiedListen(addr)) return false;
  return true;
}

export function looksLikeBootstrapAddr(addr: string, bootstraps: readonly string[]): boolean {
  if (addr.includes('p2p-circuit')) return false;
  let normalized: string;
  try {
    normalized = stripPeerId(normalizePeerAddress(addr));
  } catch {
    return false;
  }
  for (const seed of bootstraps) {
    try {
      if (normalized === stripPeerId(normalizePeerAddress(seed))) return true;
    } catch {
      // skip bad seed entries
    }
  }
  return false;
}
