import { DEFAULT_SEED_REST, LOCAL_REST } from './network/seeds.js';

export const STATUS_PROBE_URLS: readonly string[] = [LOCAL_REST, DEFAULT_SEED_REST];

export async function fetchNodeStatus(
  base: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const url = `${base.replace(/\/$/, '')}/status`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new Error(`${base} returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function firstReachableStatus(
  urls: readonly string[] = STATUS_PROBE_URLS,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string; body: unknown }> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const body = await fetchNodeStatus(url, fetchImpl);
      return { url, body };
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `Could not reach a Sphere node.\n${errors.join('\n')}\nStart one with: npm run start\nOn Windows PowerShell use curl.exe (curl is Invoke-WebRequest).`,
  );
}
