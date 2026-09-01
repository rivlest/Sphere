import { ADDRESS_PREFIX } from '../types.js';
import { bytesToHex, doubleSha256Bytes, hexToBytes } from '../core/hash.js';
import { ValidationError } from '../core/errors.js';

/** Bitcoin Base58 alphabet (no 0/O/I/l). */
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export type AddressEncoding = 'checksum' | 'legacy';

export interface ParsedAddress {
  canonical: string;
  encoding: AddressEncoding;
}

const LEGACY = new RegExp(`^${ADDRESS_PREFIX}[0-9a-f]{40}$`);

/** On-chain / consensus form: sph1 + 40 lowercase hex (20-byte key hash). */
export function isCanonicalAddress(address: string): boolean {
  return LEGACY.test(address);
}

export function decodeLegacyAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  if (!isCanonicalAddress(trimmed)) {
    throw new ValidationError('Not a legacy sph1 + 40-hex address');
  }
  return trimmed;
}

/** Display form: sph1 + Base58Check(20-byte payload). Does not accept legacy hex. */
export function encodeDisplayAddress(canonical: string): string {
  const payload = payloadFromCanonical(canonical);
  const checksum = doubleSha256Bytes(payload).subarray(0, 4);
  const packed = new Uint8Array(payload.length + 4);
  packed.set(payload, 0);
  packed.set(checksum, payload.length);
  return ADDRESS_PREFIX + encodeBase58(packed);
}

/** Decode a checksummed display address to the canonical on-chain form. */
export function decodeAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed.startsWith(ADDRESS_PREFIX)) {
    throw new ValidationError('Address must start with sph1');
  }
  const body = trimmed.slice(ADDRESS_PREFIX.length);
  if (/^[0-9a-f]{40}$/i.test(body)) {
    throw new ValidationError('Legacy address without checksum; use decodeLegacyAddress');
  }
  let raw: Uint8Array;
  try {
    raw = decodeBase58(body);
  } catch {
    throw new ValidationError('Invalid checksum address');
  }
  if (raw.length !== 24) {
    throw new ValidationError('Invalid checksum address length');
  }
  const payload = raw.subarray(0, 20);
  const checksum = raw.subarray(20);
  const expected = doubleSha256Bytes(payload).subarray(0, 4);
  if (!bytesEqual(checksum, expected)) {
    throw new ValidationError('Address checksum mismatch');
  }
  return ADDRESS_PREFIX + bytesToHex(payload);
}

/**
 * Parse user input. Checksum and legacy encodings are distinguishable
 * (40 hex vs Base58Check) so each path is explicit.
 */
export function parseAddress(input: string): ParsedAddress {
  const trimmed = input.trim();
  if (!trimmed.startsWith(ADDRESS_PREFIX)) {
    throw new ValidationError('Address must start with sph1');
  }
  const body = trimmed.slice(ADDRESS_PREFIX.length);
  if (/^[0-9a-f]{40}$/i.test(body)) {
    return { canonical: decodeLegacyAddress(trimmed), encoding: 'legacy' };
  }
  return { canonical: decodeAddress(trimmed), encoding: 'checksum' };
}

function payloadFromCanonical(canonical: string): Uint8Array {
  if (!isCanonicalAddress(canonical)) {
    throw new ValidationError('Expected a canonical sph1 + 40-hex address');
  }
  return hexToBytes(canonical.slice(ADDRESS_PREFIX.length));
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
  if (text.length === 0) throw new ValidationError('Empty Base58 payload');
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros += 1;
  let num = 0n;
  for (const ch of text) {
    const idx = BASE58.indexOf(ch);
    if (idx < 0) throw new ValidationError('Invalid Base58 character');
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
