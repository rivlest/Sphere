import { DEFAULT_SEED_REST } from '../network/seeds.js';

export function restUrlWasExplicit(argv: readonly string[] = process.argv): boolean {
  return argv.includes('--node');
}

export function nodeUnreachableMessage(url: string): string {
  return `Nie można połączyć się z węzłem pod ${url} — czy jest uruchomiony?`;
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
      throw new Error(nodeUnreachableMessage(first));
    }
    try {
      await assertReachable(seed, fetchImpl);
      return seed;
    } catch {
      throw new Error(
        `${nodeUnreachableMessage(first)} Also tried ${seed}. Start a node with npm run start, or pass --node.`,
      );
    }
  }
}

async function assertReachable(base: string, fetchImpl: typeof fetch): Promise<void> {
  try {
    const response = await fetchImpl(`${base}/status`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) {
      throw new Error(nodeUnreachableMessage(base));
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Nie można')) throw error;
    throw new Error(nodeUnreachableMessage(base));
  }
}
