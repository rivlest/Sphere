import { EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLibp2p, type Libp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { kadDHT, removePrivateAddressesMapper, type KadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { mdns } from '@libp2p/mdns';
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { dcutr } from '@libp2p/dcutr';
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { multiaddr } from '@multiformats/multiaddr';
import type { Connection, PeerId, PrivateKey, Stream } from '@libp2p/interface';
import type { P2PMessage } from '../types.js';
import { decodeMessage, encodeMessage } from './messages.js';
import { sphereDiscoveryCid } from './discovery.js';
import { SPHERE_SYNC_PROTOCOL_V2 } from './sync.js';
import { denyOutboundDial, isGossipablePeerAddress } from './gossip.js';
import {
  listenMultiaddrs,
  normalizePeerAddress,
  stripPeerId,
  toMultiaddrString,
  wsListenPort,
} from './multiaddr.js';

export const SPHERE_SYNC_PROTOCOL = '/sphere/sync/1.0.0';
export const SPHERE_DHT_PROTOCOL = '/sphere/kad/1.0.0';

export interface PeerSocket {
  id: string;
  url?: string;
  syncVersion: 1 | 2;
}

export interface P2PNetworkOptions {
  silent?: boolean;
  dataDir: string;
  lanDiscovery?: boolean;
  /** Public DHT, GitHub peer list, circuit relay client. Off in tests. */
  internetDiscovery?: boolean;
  /** Accept circuit-relay HOP reservations (use with a public --p2p-url). */
  offerRelay?: boolean;
}

const MAX_FRAME = 50 * 1024 * 1024;

export class P2PNetwork extends EventEmitter {
  private node: Libp2p | null = null;
  private advertisedUrl?: string;
  private readonly silent: boolean;
  private readonly dataDir: string;
  private readonly lanDiscovery: boolean;
  private readonly internetDiscovery: boolean;
  private readonly offerRelay: boolean;
  private readonly streams = new Map<string, Set<Stream>>();
  private readonly buffers = new Map<Stream, Buffer>();
  private readonly opening = new Set<string>();
  private readonly syncVersion = new Map<string, 1 | 2>();

  constructor(options: P2PNetworkOptions) {
    super();
    this.silent = Boolean(options.silent);
    this.dataDir = options.dataDir;
    this.lanDiscovery = options.lanDiscovery ?? true;
    this.internetDiscovery = Boolean(options.internetDiscovery);
    this.offerRelay = Boolean(options.offerRelay);
  }

  setAdvertisedUrl(url: string): void {
    this.advertisedUrl = url.replace(/\/$/, '');
  }

  getAdvertisedUrl(): string | undefined {
    return this.advertisedUrl;
  }

  get peerCount(): number {
    return this.streams.size;
  }

  getPeerUrls(): string[] {
    return this.gossipAddresses();
  }

  /** Dialable addresses to exchange with other Sphere miners (no 127.0.0.1). */
  gossipAddresses(): string[] {
    const out = new Set<string>();
    if (this.advertisedUrl && isGossipablePeerAddress(this.advertisedUrl)) {
      try {
        out.add(toMultiaddrString(this.advertisedUrl));
      } catch {
        out.add(this.advertisedUrl);
      }
    }
    if (!this.node) return [...out];

    for (const addr of this.node.getMultiaddrs()) {
      const rewritten = rewriteUnspecified(addr.toString(), this.advertisedUrl);
      if (rewritten && isGossipablePeerAddress(rewritten)) {
        out.add(rewritten);
      }
    }

    if (this.offerRelay) {
      const bases = [...out];
      for (const id of this.streams.keys()) {
        for (const base of bases) {
          if (base.includes('p2p-circuit')) continue;
          const withId = base.includes('/p2p/') ? base : `${base}/p2p/${this.node.peerId.toString()}`;
          out.add(`${withId}/p2p-circuit/p2p/${id}`);
        }
      }
    }

    return [...out];
  }

  spherePeerIds(): string[] {
    return [...this.streams.keys()];
  }

  sphereConnectionAddrs(): string[] {
    if (!this.node) return [];
    const out: string[] = [];
    for (const id of this.streams.keys()) {
      const conn = this.node.getConnections().find((item) => item.remotePeer.toString() === id);
      if (conn) out.push(conn.remoteAddr.toString());
    }
    return out;
  }

  async listen(
    port: number,
    options: { bootstrap?: string[]; announce?: string } = {},
  ): Promise<number> {
    const privateKey = await loadOrCreatePrivateKey(this.dataDir);
    const bootstrapList = (options.bootstrap ?? [])
      .map((addr) => {
        try {
          return toMultiaddrString(addr);
        } catch {
          return '';
        }
      })
      .filter(Boolean);

    const announce = options.announce
      ? [toMultiaddrString(options.announce)]
      : undefined;

    const useRelay = this.internetDiscovery || this.offerRelay;
    // NAT miners listen on /p2p-circuit so they take a HOP reservation on the seed.
    // The seed is the relay server — it must not listen as a client.
    const listenCircuit = this.internetDiscovery && !this.offerRelay;

    this.node = await createLibp2p({
      start: false,
      privateKey,
      addresses: {
        listen: [...listenMultiaddrs(port), ...(listenCircuit ? ['/p2p-circuit'] : [])],
        announce,
        ...(this.internetDiscovery
          ? {
              announceFilter: (addrs) =>
                addrs.filter((ma) => isGossipablePeerAddress(ma.toString())),
            }
          : {}),
      },
      transports: [
        webSockets(),
        tcp(),
        ...(useRelay ? [circuitRelayTransport()] : []),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      connectionGater: {
        denyDialMultiaddr: (ma) => denyOutboundDial(ma.toString()),
      },
      peerDiscovery: [
        ...(bootstrapList.length > 0 ? [bootstrap({ list: bootstrapList, timeout: 1_000 })] : []),
        ...(this.lanDiscovery ? [mdns({ serviceTag: '_sphere._udp.local' })] : []),
      ],
      connectionManager: {
        maxConnections: 128,
        maxIncomingPendingConnections: 16,
      },
      services: {
        identify: identify(),
        ping: ping(),
        dht: kadDHT({
          protocol: SPHERE_DHT_PROTOCOL,
          clientMode: false,
          allowQueryWithZeroPeers: true,
          ...(this.internetDiscovery ? { peerInfoMapper: removePrivateAddressesMapper } : {}),
          logPrefix: 'libp2p:dht-sphere',
          datastorePrefix: '/dht-sphere',
          metricsPrefix: 'libp2p_dht_sphere',
        }),
        ...(this.internetDiscovery
          ? {
              aminoDht: kadDHT({
                protocol: '/ipfs/kad/1.0.0',
                clientMode: true,
                peerInfoMapper: removePrivateAddressesMapper,
                allowQueryWithZeroPeers: true,
                logPrefix: 'libp2p:dht-amino',
                datastorePrefix: '/dht-amino',
                metricsPrefix: 'libp2p_dht_amino',
              }),
            }
          : {}),
        ...(useRelay ? { dcutr: dcutr() } : {}),
        ...(this.offerRelay
          ? { circuitRelay: circuitRelayServer({ reservations: { maxReservations: 128 } }) }
          : {}),
      },
    });

    await this.node.handle(SPHERE_SYNC_PROTOCOL, (stream, connection) => {
      this.attachStream(stream, connection, 1);
    });
    await this.node.handle(SPHERE_SYNC_PROTOCOL_V2, (stream, connection) => {
      this.attachStream(stream, connection, 2);
    });

    this.node.addEventListener('peer:identify', (event) => {
      if (event.detail.protocols.includes(SPHERE_SYNC_PROTOCOL)) {
        void this.ensureSyncStream(event.detail.peerId);
      }
    });
    this.node.addEventListener('peer:connect', (event) => {
      void this.maybeOpenSync(event.detail);
    });
    this.node.addEventListener('peer:disconnect', (event) => {
      this.dropPeer(event.detail.toString());
    });
    this.node.addEventListener('peer:discovery', (event) => {
      const info = event.detail;
      if (info.id.toString() === this.node?.peerId.toString()) return;
      if ((this.node?.getConnections(info.id).length ?? 0) > 0) return;
      const addrs = info.multiaddrs.filter((ma) => !denyOutboundDial(ma.toString()));
      if (addrs.length === 0) return;
      void this.node?.dial(addrs).catch((error: unknown) => {
        this.log('dial failed', `${info.id.toString()} ${(error as Error).message}`);
      });
    });

    await this.node.start();
    const addrs = this.node.getMultiaddrs().map((addr) => addr.toString());
    const listenPort = port !== 0 ? port : wsListenPort(addrs);
    this.log('listening', addrs.join(' ') || `port ${listenPort}`);
    return listenPort;
  }

  async connect(addr: string): Promise<void> {
    if (!this.node) throw new Error('P2P is not listening');
    const ma = toMultiaddrString(addr);
    if (this.isOwnAddress(ma)) return;
    let stream: Stream;
    let version: 1 | 2 = 2;
    try {
      stream = await this.node.dialProtocol(multiaddr(ma), SPHERE_SYNC_PROTOCOL_V2);
    } catch {
      stream = await this.node.dialProtocol(multiaddr(ma), SPHERE_SYNC_PROTOCOL);
      version = 1;
    }
    const conn = this.node
      .getConnections()
      .find((item) => item.streams.some((open) => open.id === stream.id));
    if (!conn) {
      stream.abort(new Error('Missing connection after dial'));
      return;
    }
    this.attachStream(stream, conn, version);
  }

  broadcast(message: P2PMessage, except?: PeerSocket): void {
    for (const [peerId, streams] of this.streams) {
      if (except && peerId === except.id) continue;
      const stream = firstOpen(streams);
      if (stream) writeFrame(stream, message);
    }
  }

  send(peer: PeerSocket, message: P2PMessage): void {
    const stream = firstOpen(this.streams.get(peer.id));
    if (stream) writeFrame(stream, message);
  }

  async close(): Promise<void> {
    for (const streams of this.streams.values()) {
      for (const stream of streams) {
        stream.abort(new Error('shutdown'));
      }
    }
    this.streams.clear();
    this.buffers.clear();
    if (this.node) {
      await this.node.stop();
      this.node = null;
    }
  }

  private isOwnAddress(addr: string): boolean {
    const dest = /\/p2p\/([^/]+)$/i.exec(addr)?.[1];
    if (dest && this.node && dest === this.node.peerId.toString()) return true;
    const target = stripPeerId(normalizePeerAddress(addr));
    const self = [
      this.advertisedUrl ? toMultiaddrString(this.advertisedUrl) : '',
      ...(this.node?.getMultiaddrs().map((item) => item.toString()) ?? []),
    ]
      .filter(Boolean)
      .map((item) => stripPeerId(item));
    return self.includes(target);
  }

  async advertiseSphere(): Promise<void> {
    if (!this.node) return;
    const cid = await sphereDiscoveryCid();
    for (const dht of dhtServices(this.node)) {
      try {
        for await (const _event of dht.provide(cid)) {
          /* drain */
        }
      } catch {
        // empty routing table is normal at startup
      }
    }
  }

  async findSpherePeers(): Promise<void> {
    if (!this.node) return;
    const cid = await sphereDiscoveryCid();
    const self = this.node.peerId.toString();
    for (const dht of dhtServices(this.node)) {
      try {
        const signal = AbortSignal.timeout(15_000);
        for await (const event of dht.findProviders(cid, { signal })) {
          if (event.name !== 'PROVIDER') continue;
          for (const info of event.providers) {
            if (info.id.toString() === self) continue;
            void this.node.dial(info.id).catch(() => undefined);
          }
        }
      } catch {
        // timeout / empty DHT
      }
    }
  }

  private async maybeOpenSync(peerId: PeerId): Promise<void> {
    if (!this.node) return;
    try {
      const peer = await this.node.peerStore.get(peerId);
      if (!peer.protocols.includes(SPHERE_SYNC_PROTOCOL)) return;
    } catch {
      return;
    }
    await this.ensureSyncStream(peerId);
  }

  private async ensureSyncStream(peerId: PeerId): Promise<void> {
    const id = peerId.toString();
    if (this.streams.get(id)?.size) return;
    if (this.opening.has(id) || !this.node) return;
    if (id === this.node.peerId.toString()) return;
    this.opening.add(id);
    try {
      let stream: Stream;
      let version: 1 | 2 = 2;
      try {
        stream = await this.node.dialProtocol(peerId, SPHERE_SYNC_PROTOCOL_V2);
      } catch {
        stream = await this.node.dialProtocol(peerId, SPHERE_SYNC_PROTOCOL);
        version = 1;
      }
      const conn = this.node.getConnections(peerId)[0];
      if (conn) this.attachStream(stream, conn, version);
    } catch (error) {
      this.log('sync stream failed', `${id} ${(error as Error).message}`);
    } finally {
      this.opening.delete(id);
    }
  }

  private attachStream(stream: Stream, connection: Connection, version: 1 | 2): void {
    const id = connection.remotePeer.toString();
    const existing = this.streams.get(id) ?? new Set();
    if (existing.has(stream)) return;
    const first = existing.size === 0;
    existing.add(stream);
    this.streams.set(id, existing);
    this.buffers.set(stream, Buffer.alloc(0));
    stream.maxReadBufferLength = MAX_FRAME + 8;
    const current = this.syncVersion.get(id) ?? 1;
    this.syncVersion.set(id, current === 2 || version === 2 ? 2 : 1);

    const peer: PeerSocket = {
      id,
      url: connection.remoteAddr.toString(),
      syncVersion: this.syncVersion.get(id) ?? version,
    };
    stream.addEventListener('message', (event) => {
      this.onBytes(stream, peer, Buffer.from(event.data.subarray()));
    });
    stream.addEventListener('close', () => {
      existing.delete(stream);
      this.buffers.delete(stream);
      if (existing.size === 0) this.streams.delete(id);
    });

    if (first) {
      this.log('connected', `${id} ${peer.url}`);
      this.emit('peerOpen', peer);
    }
  }

  private onBytes(stream: Stream, peer: PeerSocket, chunk: Buffer): void {
    let buf = Buffer.concat([this.buffers.get(stream) ?? Buffer.alloc(0), chunk]);
    while (buf.length >= 4) {
      const length = buf.readUInt32BE(0);
      if (length > MAX_FRAME) {
        stream.abort(new Error('P2P frame too large'));
        return;
      }
      if (buf.length < 4 + length) break;
      const raw = buf.subarray(4, 4 + length).toString('utf8');
      buf = buf.subarray(4 + length);
      const message = decodeMessage(raw);
      if (message) this.dispatch(message, peer);
    }
    this.buffers.set(stream, buf);
  }

  private dropPeer(id: string): void {
    const streams = this.streams.get(id);
    if (!streams) return;
    for (const stream of streams) {
      this.buffers.delete(stream);
    }
    this.streams.delete(id);
    this.syncVersion.delete(id);
    this.log('disconnected', id);
  }

  private dispatch(message: P2PMessage, from: PeerSocket): void {
    switch (message.type) {
      case 'NEW_BLOCK':
        this.emit('block', message.data, from);
        break;
      case 'NEW_TRANSACTION':
        this.emit('transaction', message.data, from);
        break;
      case 'QUERY_CHAIN':
        this.emit('queryChain', from, message.data);
        break;
      case 'RESPONSE_CHAIN':
        this.emit('chain', message.data, from);
        break;
      case 'QUERY_HEADERS':
        this.emit('queryHeaders', from, message.data);
        break;
      case 'RESPONSE_HEADERS':
        this.emit('headers', message.data, from);
        break;
      case 'QUERY_BODIES':
        this.emit('queryBodies', from, message.data);
        break;
      case 'RESPONSE_BODIES':
        this.emit('bodies', message.data, from);
        break;
      case 'QUERY_PEERS':
        this.emit('queryPeers', from);
        break;
      case 'RESPONSE_PEERS':
        this.emit('peers', message.data, from);
        break;
    }
  }

  private log(event: string, label: string): void {
    if (!this.silent) {
      console.log(`[p2p] ${event} ${label}`);
    }
  }
}

function rewriteUnspecified(addr: string, advertised?: string): string {
  if (!isUnspecifiedHost(addr) || !advertised) return addr;
  try {
    const publicMa = toMultiaddrString(advertised);
    const rest = addr.replace(/^\/ip[46]\/[^/]+/, '');
    const prefix = publicMa.match(/^\/ip[46]\/[^/]+/)?.[0];
    if (!prefix) return publicMa;
    return `${prefix}${rest}`;
  } catch {
    return addr;
  }
}

function isUnspecifiedHost(addr: string): boolean {
  return /\/ip4\/0\.0\.0\.0\b/.test(addr) || /\/ip6\/::(\/|$)/.test(addr);
}

function dhtServices(node: Libp2p): KadDHT[] {
  const services = node.services as Record<string, unknown>;
  const out: KadDHT[] = [];
  for (const key of ['dht', 'aminoDht']) {
    const svc = services[key] as KadDHT | undefined;
    if (svc && typeof svc.provide === 'function') out.push(svc);
  }
  return out;
}

function writeFrame(stream: Stream, message: P2PMessage): void {
  const payload = Buffer.from(encodeMessage(message), 'utf8');
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  stream.send(frame);
}

function firstOpen(streams: Set<Stream> | undefined): Stream | undefined {
  if (!streams) return undefined;
  for (const stream of streams) {
    if (stream.status === 'open') return stream;
  }
  return undefined;
}

async function loadOrCreatePrivateKey(dataDir: string): Promise<PrivateKey> {
  const file = path.join(dataDir, 'libp2p.key');
  try {
    return privateKeyFromProtobuf(await readFile(file));
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') throw error;
    const key = await generateKeyPair('Ed25519');
    await mkdir(dataDir, { recursive: true });
    await writeFile(file, Buffer.from(privateKeyToProtobuf(key)));
    return key;
  }
}

export { normalizePeerAddress as normalizePeerUrl, toMultiaddrString };
