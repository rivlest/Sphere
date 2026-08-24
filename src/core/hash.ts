import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/** Deterministic JSON with lexicographically sorted object keys. */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(',');
  return `{${body}}`;
}

export function sha256Bytes(data: string | Uint8Array): Uint8Array {
  return sha256(typeof data === 'string' ? utf8ToBytes(data) : data);
}

export function sha256Hex(data: string | Uint8Array): string {
  return bytesToHex(sha256Bytes(data));
}

export function doubleSha256Hex(data: string | Uint8Array): string {
  const first = sha256Bytes(data);
  return bytesToHex(sha256(first));
}

export function concatHexHashes(a: string, b: string): Uint8Array {
  return concatBytes(hexToBytes(a), hexToBytes(b));
}

export { bytesToHex, hexToBytes, utf8ToBytes };
