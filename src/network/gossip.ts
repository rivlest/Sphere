import { networkInterfaces } from 'node:os';
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

export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isPrivateIpv6(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value === '::1') return false;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (/^fe[89ab]/i.test(value)) return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  return false;
}

export function ipv4sInAddress(addr: string): string[] {
  const found: string[] = [];
  const re = /(?:\/ip4\/|(?:wss?:\/\/))(\d{1,3}(?:\.\d{1,3}){3})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(addr)) !== null) found.push(match[1]);
  return found;
}

export function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!base || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/** RFC1918, CGNAT, link-local, IPv6 ULA — not globally reachable. */
export function isPrivateLanAddress(addr: string): boolean {
  if (ipv4sInAddress(addr).some((ip) => isPrivateIpv4(ip))) return true;
  const v6 = /\/ip6\/([^/]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = v6.exec(addr)) !== null) {
    if (isPrivateIpv6(match[1])) return true;
  }
  const url6 = /\[([0-9a-f:]+)\]/gi;
  while ((match = url6.exec(addr)) !== null) {
    if (isPrivateIpv6(match[1])) return true;
  }
  return false;
}

/** True when `addr` sits on one of this machine's private IPv4 subnets (mDNS / same Wi-Fi). */
export function isOnSameLan(addr: string): boolean {
  const ips = ipv4sInAddress(addr).filter((ip) => isPrivateIpv4(ip));
  if (ips.length === 0) return false;
  for (const addrs of Object.values(networkInterfaces())) {
    for (const info of addrs ?? []) {
      const family = String(info.family);
      if (info.internal || (family !== 'IPv4' && family !== '4') || !info.cidr) continue;
      if (!isPrivateIpv4(info.address)) continue;
      if (ips.some((ip) => ipv4InCidr(ip, info.cidr!))) return true;
    }
  }
  return false;
}

/** Addresses worth telling other miners about. Never loopback, LAN, or 0.0.0.0. */
export function isGossipablePeerAddress(addr: string): boolean {
  if (!isPeerAddress(addr) || addr.length > 2048) return false;
  if (isLoopbackAddress(addr)) return false;
  if (isUnspecifiedListen(addr)) return false;
  if (/\.local(\b|:|\/|$)/i.test(addr)) return false;
  if (isPrivateLanAddress(addr)) return false;
  return true;
}

/** What this node should actually dial: public/circuit, loopback (tests), or same-LAN. */
export function isDialablePeerAddress(addr: string): boolean {
  if (!isPeerAddress(addr) || addr.length > 2048) return false;
  if (isUnspecifiedListen(addr)) return false;
  if (isLoopbackAddress(addr)) return true;
  if (isGossipablePeerAddress(addr)) return true;
  return isPrivateLanAddress(addr) && isOnSameLan(addr);
}

/** libp2p connection-gater: skip other people's RFC1918, keep LAN and public. */
export function denyOutboundDial(addr: string): boolean {
  if (isUnspecifiedListen(addr)) return true;
  if (isLoopbackAddress(addr)) return false;
  if (isPrivateLanAddress(addr)) return !isOnSameLan(addr);
  return false;
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

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((part) => Number(part));
  return ((((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0);
}
