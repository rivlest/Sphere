import { ADDRESS_PREFIX } from '../types';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const LEGACY = new RegExp(`^${ADDRESS_PREFIX}[0-9a-f]{40}$`);

export type AddressEncoding = 'checksum' | 'legacy';

export interface ParsedAddress {
  canonical: string;
  encoding: AddressEncoding;
}

function doubleSha256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

export function isCanonicalAddress(address: string): boolean {
  return LEGACY.test(address);
}

export function decodeLegacyAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  if (!isCanonicalAddress(trimmed)) {
    throw new Error('Not a legacy sph1 + 40-hex address');
  }
  return trimmed;
}

export function encodeDisplayAddress(canonical: string): string {
  if (!isCanonicalAddress(canonical)) {
    throw new Error('Expected a canonical sph1 + 40-hex address');
  }
  const payload = hexToBytes(canonical.slice(ADDRESS_PREFIX.length));
  const checksum = doubleSha256(payload).subarray(0, 4);
  const packed = new Uint8Array(payload.length + 4);
  packed.set(payload, 0);
  packed.set(checksum, payload.length);
  return ADDRESS_PREFIX + encodeBase58(packed);
}

export function decodeAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed.startsWith(ADDRESS_PREFIX)) {
    throw new Error('Address must start with sph1');
  }
  const body = trimmed.slice(ADDRESS_PREFIX.length);
  if (/^[0-9a-f]{40}$/i.test(body)) {
    throw new Error('Legacy address without checksum; use decodeLegacyAddress');
  }
  const raw = decodeBase58(body);
  if (raw.length !== 24) {
    throw new Error('Invalid checksum address length');
  }
  const payload = raw.subarray(0, 20);
  const checksum = raw.subarray(20);
  const expected = doubleSha256(payload).subarray(0, 4);
  if (!bytesEqual(checksum, expected)) {
    throw new Error('Address checksum mismatch');
  }
  return ADDRESS_PREFIX + bytesToHex(payload);
}

export function parseAddress(input: string): ParsedAddress {
  const trimmed = input.trim();
  if (!trimmed.startsWith(ADDRESS_PREFIX)) {
    throw new Error('Address must start with sph1');
  }
  const body = trimmed.slice(ADDRESS_PREFIX.length);
  if (/^[0-9a-f]{40}$/i.test(body)) {
    return { canonical: decodeLegacyAddress(trimmed), encoding: 'legacy' };
  }
  return { canonical: decodeAddress(trimmed), encoding: 'checksum' };
}

function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  let num = 0n;
  for (const byte of bytes) {
    num = (num << 8n) + BigInt(byte);
  }
  let out = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    num /= 58n;
    out = BASE58[rem] + out;
  }
  return '1'.repeat(zeros) + out;
}

function decodeBase58(text: string): Uint8Array {
  if (text.length === 0) throw new Error('Empty Base58 payload');
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros += 1;
  let num = 0n;
  for (const ch of text) {
    const idx = BASE58.indexOf(ch);
    if (idx < 0) throw new Error('Invalid Base58 character');
    num = num * 58n + BigInt(idx);
  }
  const body: number[] = [];
  while (num > 0n) {
    body.push(Number(num % 256n));
    num /= 256n;
  }
  body.reverse();
  const out = new Uint8Array(zeros + body.length);
  out.set(body, zeros);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
