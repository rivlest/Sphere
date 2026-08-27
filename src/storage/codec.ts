import type { Block, BlockHeader, Transaction, TxInput, TxOutput } from '../types.js';

export const SPHERE_MAGIC = Buffer.from('SPH1');
export const INDEX_VERSION = 1;

class Writer {
  private chunks: Buffer[] = [];

  u32(value: number): void {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value);
    this.chunks.push(buf);
  }

  u64(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Cannot encode ${value} as u64`);
    }
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(value));
    this.chunks.push(buf);
  }

  bytes(value: Buffer): void {
    this.chunks.push(value);
  }

  hex32(hex: string): void {
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      throw new Error(`Expected 32-byte hex, got ${hex.slice(0, 16)}…`);
    }
    this.chunks.push(Buffer.from(hex, 'hex'));
  }

  lpBytes(value: Buffer): void {
    this.u32(value.length);
    this.bytes(value);
  }

  lpString(value: string): void {
    this.lpBytes(Buffer.from(value, 'utf8'));
  }

  concat(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

class Reader {
  constructor(
    private readonly buf: Buffer,
    private offset = 0,
  ) {}

  get remaining(): number {
    return this.buf.length - this.offset;
  }

  u32(): number {
    this.need(4);
    const value = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  u64(): number {
    this.need(8);
    const value = Number(this.buf.readBigUInt64LE(this.offset));
    this.offset += 8;
    if (!Number.isSafeInteger(value)) {
      throw new Error('u64 exceeds safe integer range');
    }
    return value;
  }

  bytes(length: number): Buffer {
    this.need(length);
    const value = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  hex32(): string {
    return this.bytes(32).toString('hex');
  }

  lpBytes(): Buffer {
    return this.bytes(this.u32());
  }

  lpString(): string {
    return this.lpBytes().toString('utf8');
  }

  private need(length: number): void {
    if (this.offset + length > this.buf.length) {
      throw new Error('Unexpected end of binary payload');
    }
  }
}

export function encodeTransaction(tx: Transaction): Buffer {
  const w = new Writer();
  w.u32(tx.inputs.length);
  for (const input of tx.inputs) {
    w.hex32(input.txid);
    w.u32(input.vout);
    w.lpBytes(Buffer.from(input.signature, 'hex'));
  }
  w.u32(tx.outputs.length);
  for (const output of tx.outputs) {
    w.lpString(output.address);
    w.u64(output.amount);
  }
  w.u64(tx.timestamp);
  w.hex32(tx.hash);
  return w.concat();
}

export function decodeTransaction(buf: Buffer, start = 0): { tx: Transaction; consumed: number } {
  const r = new Reader(buf.subarray(start));
  const startRemaining = r.remaining;
  const inputCount = r.u32();
  const inputs: TxInput[] = [];
  for (let i = 0; i < inputCount; i++) {
    inputs.push({
      txid: r.hex32(),
      vout: r.u32(),
      signature: r.lpBytes().toString('hex'),
    });
  }
  const outputCount = r.u32();
  const outputs: TxOutput[] = [];
  for (let i = 0; i < outputCount; i++) {
    outputs.push({
      address: r.lpString(),
      amount: r.u64(),
    });
  }
  const timestamp = r.u64();
  const hash = r.hex32();
  const consumed = startRemaining - r.remaining;
  return { tx: { inputs, outputs, timestamp, hash }, consumed };
}

export function encodeBlock(block: Block): Buffer {
  const w = new Writer();
  encodeHeader(w, block.header);
  w.hex32(block.hash);
  w.u32(block.transactions.length);
  for (const tx of block.transactions) {
    const encoded = encodeTransaction(tx);
    w.u32(encoded.length);
    w.bytes(encoded);
  }
  return w.concat();
}

function encodeHeader(w: Writer, header: BlockHeader): void {
  w.u32(header.version);
  w.u32(header.index);
  w.u64(header.timestamp);
  w.hex32(header.previousHash);
  w.hex32(header.merkleRoot);
  w.u64(header.nonce);
  w.u32(header.bits);
}

export function decodeBlock(buf: Buffer): Block {
  const r = new Reader(buf);
  const header: BlockHeader = {
    version: r.u32(),
    index: r.u32(),
    timestamp: r.u64(),
    previousHash: r.hex32(),
    merkleRoot: r.hex32(),
    nonce: r.u64(),
    bits: r.u32(),
  };
  const hash = r.hex32();
  const txCount = r.u32();
  const transactions: Transaction[] = [];
  for (let i = 0; i < txCount; i++) {
    const length = r.u32();
    const { tx } = decodeTransaction(r.bytes(length));
    transactions.push(tx);
  }
  if (r.remaining !== 0) {
    throw new Error('Trailing bytes in block payload');
  }
  return { header, hash, transactions };
}

export function encodeRecord(payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  SPHERE_MAGIC.copy(header, 0);
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

export function decodeRecord(buf: Buffer, offset: number): { payload: Buffer; length: number } {
  if (offset + 8 > buf.length) {
    throw new Error('Truncated block record header');
  }
  const magic = buf.subarray(offset, offset + 4);
  if (!magic.equals(SPHERE_MAGIC)) {
    throw new Error('Invalid block file magic');
  }
  const payloadLength = buf.readUInt32LE(offset + 4);
  const end = offset + 8 + payloadLength;
  if (end > buf.length) {
    throw new Error('Truncated block payload');
  }
  return { payload: buf.subarray(offset + 8, end), length: end - offset };
}

export interface IndexEntry {
  offset: number;
  length: number;
  hash: string;
}

export function encodeIndex(entries: IndexEntry[]): Buffer {
  const w = new Writer();
  w.u32(INDEX_VERSION);
  w.u32(entries.length);
  for (const entry of entries) {
    w.u64(entry.offset);
    w.u32(entry.length);
    w.hex32(entry.hash);
  }
  return w.concat();
}

export function decodeIndex(buf: Buffer): IndexEntry[] {
  if (buf.length === 0) return [];
  const r = new Reader(buf);
  const version = r.u32();
  if (version !== INDEX_VERSION) {
    throw new Error(`Unsupported chain index version ${version}`);
  }
  const count = r.u32();
  const entries: IndexEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      offset: r.u64(),
      length: r.u32(),
      hash: r.hex32(),
    });
  }
  if (r.remaining !== 0) {
    throw new Error('Trailing bytes in chain index');
  }
  return entries;
}

export function isAccountBasedSnapshot(blocks: unknown): boolean {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  const first = blocks[0] as { transactions?: Array<Record<string, unknown>> };
  const tx = first.transactions?.[0];
  return Boolean(tx && 'from' in tx && 'nonce' in tx && !('inputs' in tx));
}
