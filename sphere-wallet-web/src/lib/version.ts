export function parseSoftwareVersion(raw: string): string | null {
  const match = raw.trim().match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3] ?? '0'}`;
}

export function sphereCoreLabel(version: string): string {
  const parsed = parseSoftwareVersion(version);
  if (!parsed) return version;
  const [major, minor] = parsed.split('.');
  return `Sphere core ${major}.${minor}`;
}

export function compareSemver(a: string, b: string): number {
  const leftRaw = parseSoftwareVersion(a) ?? a;
  const rightRaw = parseSoftwareVersion(b) ?? b;
  const left = leftRaw.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = rightRaw.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const av = left[i] ?? 0;
    const bv = right[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export function isOutdated(local: string, latest: string): boolean {
  const a = parseSoftwareVersion(local);
  const b = parseSoftwareVersion(latest);
  if (!a || !b) return false;
  return compareSemver(a, b) < 0;
}

/** True when GitHub's x.y is ahead of the node's public label (ignores patch). */
export function publicReleaseOutdated(local: string, latest: string): boolean {
  const a = parseSoftwareVersion(local);
  const b = parseSoftwareVersion(latest);
  if (!a || !b) return false;
  const [am, an] = a.split('.').map((part) => Number.parseInt(part, 10));
  const [bm, bn] = b.split('.').map((part) => Number.parseInt(part, 10));
  if (am !== bm) return am < bm;
  return an < bn;
}

const PUBLISHED_URLS = [
  'https://cdn.jsdelivr.net/gh/rivlest/Sphere@master/package.json',
  'https://raw.githubusercontent.com/rivlest/Sphere/master/package.json',
];

export async function fetchPublishedVersion(): Promise<string | null> {
  for (const url of PUBLISHED_URLS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
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
      // next mirror
    }
  }
  return null;
}
