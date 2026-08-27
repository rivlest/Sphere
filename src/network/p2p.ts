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
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { mdns } from '@libp2p/mdns';
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { multiaddr } from '@multiformats/multiaddr';
import type { Connection, PeerId, PrivateKey, Stream } from '@libp2p/interface';
import type { P2PMessage } from '../types.js';
import { decodeMessage, encodeMessage } from './messages.js';
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
}

export interface P2PNetworkOptions {
  silent?: boolean;
  dataDir: string;
  lanDiscovery?: boolean;
}

const MAX_FRAME = 50 * 1024 * 1024;

export class P2PNetwork extends EventEmitter {
  private node: Libp2p | null = null;
  private advertisedUrl?: string;
  private readonly silent: boolean;
  private readonly dataDir: string;
  private readonly lanDiscovery: boolean;
  private readonly streams = new Map<string, Set<Stream>>();
  private readonly buffers = new Map<Stream, Buffer>();
  private readonly opening = new Set<string>();

  constructor(options: P2PNetworkOptions) {
    super();
    this.silent = Boolean(options.silent);
    this.dataDir = options.dataDir;
    this.lanDiscovery = options.lanDiscovery ?? true;
  }

  setAdvertisedUrl(url: string): void {
    this.advertisedUrl = url.replace(/\/$/, '');
  }

  getAdvertisedUrl(): string | undefined {
    return this.advertisedUrl;
  }

  get peerCount(): number {
    return this.node?.getPeers().length ?? 0;
  }

  getPeerUrls(): string[] {
    const urls: string[] = [];
    if (this.advertisedUrl) urls.push(this.advertisedUrl);
    for (const conn of this.node?.getConnections() ?? []) {
      urls.push(conn.remoteAddr.toString());
    }
    return [...new Set(urls)];
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

    this.node = await createLibp2p({
      start: false,
      privateKey,
      addresses: {
        listen: listenMultiaddrs(port),
        announce,
      },
      transports: [webSockets(), tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
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
        }),
      },
    });

    await this.node.handle(SPHERE_SYNC_PROTOCOL, (stream, connection) => {
      this.attachStream(stream, connection);
    });

    this.node.addEventListener('peer:connect', (event) => {
      void this.ensureSyncStream(event.detail);
    });
    this.node.addEventListener('peer:disconnect', (event) => {
      this.dropPeer(event.detail.toString());
    });
    this.node.addEventListener('peer:discovery', (event) => {
      const info = event.detail;
      if (info.id.toString() === this.node?.peerId.toString()) return;
      if ((this.node?.getConnections(info.id).length ?? 0) > 0) return;
      void this.node?.dial(info.multiaddrs).catch((error: unknown) => {
        this.log('dial failed', `${info.id.toString()} ${(error as Error).message}`);
      });
    });

    await this.node.start();
    const addrs = this.node.getMultiaddrs().map((addr) => addr.toString());
    const listenPort = wsListenPort(addrs);
    this.log('listening', addrs.join(' '));
    return listenPort;
  }

  async connect(addr: string): Promise<void> {
    if (!this.node) throw new Error('P2P is not listening');
    const ma = toMultiaddrString(addr);
    if (this.isSelf(ma)) return;
    const stream = await this.node.dialProtocol(multiaddr(ma), SPHERE_SYNC_PROTOCOL);
    const conn = this.node
      .getConnections()
      .find((item) => item.streams.some((open) => open.id === stream.id));
    if (!conn) {
      stream.abort(new Error('Missing connection after dial'));
      return;
    }
    this.attachStream(stream, conn);
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

  private isSelf(addr: string): boolean {
    const target = stripPeerId(normalizePeerAddress(addr));
    const self = [
      this.advertisedUrl ? toMultiaddrString(this.advertisedUrl) : '',
      ...(this.node?.getMultiaddrs().map((item) => item.toString()) ?? []),
    ]
      .filter(Boolean)
      .map((item) => stripPeerId(item));
    return self.includes(target);
  }

  private async ensureSyncStream(peerId: PeerId): Promise<void> {
    const id = peerId.toString();
    if (this.streams.get(id)?.size) return;
    if (this.opening.has(id) || !this.node) return;
    if (id === this.node.peerId.toString()) return;
    this.opening.add(id);
    try {
      const stream = await this.node.dialProtocol(peerId, SPHERE_SYNC_PROTOCOL);
      const conn = this.node.getConnections(peerId)[0];
      if (conn) this.attachStream(stream, conn);
    } catch (error) {
      this.log('sync stream failed', `${id} ${(error as Error).message}`);
    } finally {
      this.opening.delete(id);
    }
  }

  private attachStream(stream: Stream, connection: Connection): void {
    const id = connection.remotePeer.toString();
    const existing = this.streams.get(id) ?? new Set();
    if (existing.has(stream)) return;
    const first = existing.size === 0;
    existing.add(stream);
    this.streams.set(id, existing);
    this.buffers.set(stream, Buffer.alloc(0));
    stream.maxReadBufferLength = MAX_FRAME + 8;

    const peer: PeerSocket = { id, url: connection.remoteAddr.toString() };
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
        this.emit('queryChain', from);
        break;
      case 'RESPONSE_CHAIN':
        this.emit('chain', message.data, from);
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
