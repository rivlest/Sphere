/** Compact unsigned nBits: 1 byte exponent E, 3 byte mantissa C, big-endian. target = C * 256^(E-3). */

export const GENESIS_BITS = 0x20ffffff;

export function bitsToTarget(bits: number): bigint {
  if (!Number.isInteger(bits) || bits < 0 || bits > 0xffffffff) {
    throw new RangeError(`bits out of range: ${bits}`);
  }
  const exponent = (bits >>> 24) & 0xff;
  const mantissa = bits & 0x00ffffff;
  if (mantissa === 0) return 0n;
  const coeff = BigInt(mantissa);
  const shift = exponent - 3;
  if (shift >= 0) return coeff * 256n ** BigInt(shift);
  return coeff / 256n ** BigInt(-shift);
}

export function targetToBits(target: bigint): number {
  if (target < 0n) {
    throw new RangeError('target must be unsigned');
  }
  if (target === 0n) return 0;
  let hex = target.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  let size = hex.length / 2;
  let compact =
    size <= 3 ? target << (8n * BigInt(3 - size)) : target >> (8n * BigInt(size - 3));
  while (compact > 0x00ffffffn) {
    compact >>= 8n;
    size += 1;
  }
  if (size > 255) {
    throw new RangeError('target is too large for 32-bit bits');
  }
  return Number((BigInt(size) << 24n) | compact);
}

export function hashToBigInt(hash: string): bigint {
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new RangeError('PoW hash must be 32-byte hex');
  }
  return BigInt(`0x${hash}`);
}

export function meetsProofOfWork(hash: string, bits: number): boolean {
  return hashToBigInt(hash) <= bitsToTarget(bits);
}

export function isValidBits(bits: number): boolean {
  try {
    return bitsToTarget(bits) >= 1n;
  } catch {
    return false;
  }
}

/** Work vs genesis target (1 = trivial). Uses micro-units so 1.4 is visible. */
export function workRatio(bits: number, genesisBits = GENESIS_BITS): number {
  const current = bitsToTarget(bits);
  const genesis = bitsToTarget(genesisBits);
  if (current === 0n) return Number.POSITIVE_INFINITY;
  return Number((genesis * 1_000_000n) / current) / 1_000_000;
}

export const RETARGET_NUMERATOR = 5n;
export const RETARGET_DENOMINATOR = 7n;

/** Tighten: new_target = old / 1.4 */
export function retargetTarget(oldTarget: bigint): bigint {
  const next = (oldTarget * RETARGET_NUMERATOR) / RETARGET_DENOMINATOR;
  return next < 1n ? 1n : next;
}

/** Loosen: new_target = old * 1.4 */
export function easeTarget(oldTarget: bigint): bigint {
  const next = (oldTarget * RETARGET_DENOMINATOR) / RETARGET_NUMERATOR;
  return next < 1n ? 1n : next;
}

export function clampTarget(target: bigint, genesisBits = GENESIS_BITS): bigint {
  if (target < 1n) return 1n;
  const easiest = bitsToTarget(genesisBits);
  return target > easiest ? easiest : target;
}

/** 2^256. Work of a block is this divided by (target + 1). */
export const POW_256 = 1n << 256n;

/** Expected hashes to beat `bits`. Higher bits-difficulty → more work. */
export function blockWork(bits: number): bigint {
  const target = bitsToTarget(bits);
  if (target < 0n) throw new RangeError(`bits out of range: ${bits}`);
  return POW_256 / (target + 1n);
}

export function cumulativeWorkOf(bits: readonly number[]): bigint {
  let work = 0n;
  for (const value of bits) work += blockWork(value);
  return work;
}
