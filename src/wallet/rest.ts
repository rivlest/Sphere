import { DEFAULT_SEED_REST } from '../network/seeds.js';

export function restUrlWasExplicit(argv: readonly string[] = process.argv): boolean {
  return argv.includes('--node');
}

export async function resolveRestUrl(
  preferred: string,
  explicit: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const first = preferred.replace(/\/$/, '');
  if (explicit) {
    await assertReachable(first, fetchImpl);
    return first;
  }
  try {
    await assertReachable(first, fetchImpl);
    return first;
  } catch {
    const seed = DEFAULT_SEED_REST.replace(/\/$/, '');
    if (seed === first) {
      throw new Error(`Cannot reach a Sphere node at ${first}`);
    }
    try {
      await assertReachable(seed, fetchImpl);
      return seed;
    } catch {
      throw new Error(
        `Cannot reach ${first} or ${seed}. Start a node with npm run start, or pass --node.`,
      );
    }
  }
}

async function assertReachable(base: string, fetchImpl: typeof fetch): Promise<void> {
  try {
    const response = await fetchImpl(`${base}/status`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) {
      throw new Error(`Cannot reach ${base}`);
    }
  } catch {
    throw new Error(`Cannot reach ${base}`);
  }
}
