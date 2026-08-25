import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';
import type { P2PMessage } from '../types.js';
import { decodeMessage, encodeMessage } from './messages.js';

export interface PeerSocket {
  id: number;
  url?: string;
  socket: WebSocket;
}

export class P2PNetwork extends EventEmitter {
  private server: WebSocketServer | null = null;
  private peers = new Map<number, PeerSocket>();
  private outbound = new Set<string>();
  private nextId = 1;
  private listenPort = 0;
  private advertisedUrl?: string;
  private readonly silent: boolean;

  constructor(advertisedUrl?: string, silent = false) {
    super();
    this.advertisedUrl = advertisedUrl;
    this.silent = silent;
  }

  setAdvertisedUrl(url: string): void {
    this.advertisedUrl = url;
  }

  getAdvertisedUrl(): string | undefined {
    return this.advertisedUrl;
  }

  getOutboundUrls(): string[] {
    return [...this.outbound];
  }

  get peerCount(): number {
    return this.peers.size;
  }

  getPeerUrls(): string[] {
    const urls = [...this.peers.values()]
      .map((peer) => peer.url)
      .filter((url): url is string => Boolean(url));
    if (this.advertisedUrl) urls.push(this.advertisedUrl);
    return [...new Set(urls)];
  }

  async listen(port: number): Promise<number> {
    this.listenPort = port;
    this.server = new WebSocketServer({ port, maxPayload: 50 * 1024 * 1024 });
    this.server.on('connection', (socket, request) => {
      const forwarded = request.socket.remoteAddress;
      this.attach(socket, undefined, `inbound:${forwarded ?? 'unknown'}`);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('listening', () => resolve());
      this.server!.once('error', reject);
    });
    const address = this.server.address();
    if (address && typeof address === 'object') {
      this.listenPort = address.port;
    }
    return this.listenPort;
  }

  async connect(url: string): Promise<void> {
    const normalized = normalizePeerUrl(url);
    if (this.advertisedUrl && normalizePeerUrl(this.advertisedUrl) === normalized) return;
    if (this.outbound.has(normalized)) return;
    if (this.outbound.size >= 16) return;
    this.outbound.add(normalized);

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(normalized);
      const onError = (error: Error) => {
        this.outbound.delete(normalized);
        reject(error);
      };
      socket.once('error', onError);
      socket.once('open', () => {
        socket.off('error', onError);
        this.attach(socket, normalized);
        resolve();
      });
    });
  }

  broadcast(message: P2PMessage, except?: PeerSocket): void {
    const raw = encodeMessage(message);
    for (const peer of this.peers.values()) {
      if (except && peer.id === except.id) continue;
      if (peer.socket.readyState === WebSocket.OPEN) {
        peer.socket.send(raw);
      }
    }
  }

  send(peer: PeerSocket, message: P2PMessage): void {
    this.sendTo(peer.socket, message);
  }

  async close(): Promise<void> {
    for (const peer of this.peers.values()) {
      peer.socket.close();
    }
    this.peers.clear();
    this.outbound.clear();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  private sendTo(socket: WebSocket, message: P2PMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(encodeMessage(message));
    }
  }

  private attach(socket: WebSocket, url?: string, inboundLabel?: string): void {
    const peer: PeerSocket = { id: this.nextId++, url, socket };
    this.peers.set(peer.id, peer);
    this.log('connected', url ?? inboundLabel ?? String(peer.id));

    socket.on('message', (data) => {
      const message = decodeMessage(data.toString());
      if (!message) return;
      this.dispatch(message, peer);
    });
    socket.on('close', () => {
      this.peers.delete(peer.id);
      if (url) this.outbound.delete(url);
      this.log('disconnected', url ?? inboundLabel ?? String(peer.id));
    });
    socket.on('error', () => {
      socket.close();
    });
    this.emit('peerOpen', peer);
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

export function normalizePeerUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}
