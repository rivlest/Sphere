/** Software release (semver). GET /status shows `Sphere core x.y`, not the patch. */
export const SPHERE_VERSION = '1.2.1';

export function parseSoftwareVersion(raw: string): string | null {
  const match = raw.trim().match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3] ?? '0'}`;
}

/** Public label: `Sphere core 1.2` from `1.2.1` or `Sphere core 1.2`. */
export function sphereCoreLabel(version = SPHERE_VERSION): string {
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

export function outdatedNotice(local: string, latest: string): string {
  const from = sphereCoreLabel(local);
  const to = sphereCoreLabel(latest);
  if (from === to) {
    return `outdated: ${from}. Update with: git pull`;
  }
  return `outdated: you have ${from}, latest is ${to}. Update with: git pull`;
}
