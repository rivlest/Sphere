import { hash as argon2Hash, argon2id } from 'argon2';
import type { BlockHeader, PowParams } from '../types.js';
import { DEFAULT_POW } from '../types.js';
import { canonicalStringify } from './hash.js';
import { meetsProofOfWork } from './bits.js';

export function serializeHeader(header: BlockHeader): string {
  return canonicalStringify(header);
}

export async function hashBlockHeader(
  header: BlockHeader,
  pow: PowParams = DEFAULT_POW,
): Promise<string> {
  if (pow.algorithm !== 'argon2id') {
    throw new Error(`Unsupported PoW algorithm ${pow.algorithm}`);
  }
  const salt = Buffer.from(pow.salt, 'utf8');
  if (salt.length < 8) {
    throw new Error('PoW salt must be at least 8 bytes');
  }
  const digest = await argon2Hash(serializeHeader(header), {
    type: argon2id,
    raw: true,
    hashLength: pow.hashLength,
    salt,
    memoryCost: pow.memoryCost,
    timeCost: pow.timeCost,
    parallelism: pow.parallelism,
  });
  return digest.toString('hex');
}

export async function mineBlock(
  header: BlockHeader,
  options: { signal?: AbortSignal; pow?: PowParams } = {},
): Promise<{ header: BlockHeader; hash: string }> {
  const working: BlockHeader = { ...header };
  const pow = options.pow ?? DEFAULT_POW;

  for (let nonce = 0; nonce <= Number.MAX_SAFE_INTEGER; nonce++) {
    if (options.signal?.aborted) {
      throw new DOMException('Mining aborted', 'AbortError');
    }
    working.nonce = nonce;
    const hash = await hashBlockHeader(working, pow);
    if (meetsProofOfWork(hash, working.bits)) {
      return { header: working, hash };
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Nonce space exhausted');
}
