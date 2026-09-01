import { SPHERE_VERSION, isOutdated, outdatedNotice } from './version.js';

export const PUBLISHED_VERSION_URLS: readonly string[] = [
  'https://raw.githubusercontent.com/rivlest/Sphere/master/package.json',
  'https://cdn.jsdelivr.net/gh/rivlest/Sphere@master/package.json',
];

export async function fetchPublishedVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  for (const url of PUBLISHED_VERSION_URLS) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) continue;
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === 'object' &&
        'version' in body &&
        typeof (body as { version: unknown }).version === 'string' &&
        /^\d+\.\d+\.\d+/.test((body as { version: string }).version)
      ) {
        return (body as { version: string }).version;
      }
    } catch {
      // try the next mirror
    }
  }
  return null;
}

export async function checkSoftwareUpdate(
  local = SPHERE_VERSION,
  fetchImpl: typeof fetch = fetch,
): Promise<{ latest: string | null; outdated: boolean; notice: string | null }> {
  const latest = await fetchPublishedVersion(fetchImpl);
  if (!latest) return { latest: null, outdated: false, notice: null };
  if (!isOutdated(local, latest)) return { latest, outdated: false, notice: null };
  return { latest, outdated: true, notice: outdatedNotice(local, latest) };
}
