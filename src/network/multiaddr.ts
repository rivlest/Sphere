/** Convert CLI `ws://` / `wss://` URLs and multiaddrs into dialable multiaddr strings. */

export function isPeerAddress(addr: string): boolean {
  const value = addr.trim();
  if (value.length === 0 || value.length > 2048) return false;
  if (/^wss?:\/\/[^/\s]+/i.test(value)) return true;
  return value.startsWith('/') && /\/(tcp|udp|ws|wss|p2p|dnsaddr)\b/.test(value);
}

/** @deprecated Use isPeerAddress — kept for existing tests and call sites. */
export function isPeerUrl(addr: string): boolean {
  return isPeerAddress(addr);
}

export function normalizePeerAddress(addr: string): string {
  return toMultiaddrString(addr).replace(/\/$/, '');
}

export function normalizePeerUrl(addr: string): string {
  return normalizePeerAddress(addr);
}

export function toMultiaddrString(addr: string): string {
  const value = addr.trim().replace(/\/$/, '');
  if (value.startsWith('/')) return value;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid peer address: ${addr}`);
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`Unsupported peer URL protocol: ${parsed.protocol}`);
  }

  const port = parsed.port || (parsed.protocol === 'wss:' ? '443' : '80');
  const ws = parsed.protocol === 'wss:' ? 'wss' : 'ws';
  const host = parsed.hostname;

  if (host.startsWith('[')) {
    return `/ip6/${host.slice(1, -1)}/tcp/${port}/${ws}`;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return `/ip4/${host}/tcp/${port}/${ws}`;
  }
  return `/dns4/${host}/tcp/${port}/${ws}`;
}

export function wsListenPort(multiaddrs: string[]): number {
  for (const addr of multiaddrs) {
    const ws = /\/tcp\/(\d+)\/wss?/.exec(addr);
    if (ws) return Number(ws[1]);
  }
  for (const addr of multiaddrs) {
    const tcp = /\/tcp\/(\d+)/.exec(addr);
    if (tcp) return Number(tcp[1]);
  }
  return 0;
}

export function stripPeerId(multiaddr: string): string {
  return multiaddr.replace(/\/p2p\/[^/]+$/i, '');
}

export function listenMultiaddrs(port: number): string[] {
  if (port === 0) {
    return ['/ip4/0.0.0.0/tcp/0/ws', '/ip4/0.0.0.0/tcp/0'];
  }
  return [`/ip4/0.0.0.0/tcp/${port}/ws`, `/ip4/0.0.0.0/tcp/${port + 1}`];
}
