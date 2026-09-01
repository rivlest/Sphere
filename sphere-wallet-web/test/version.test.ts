import { describe, expect, it } from 'vitest';
import { compareSemver, isOutdated, publicReleaseOutdated, sphereCoreLabel } from '../src/lib/version';

describe('published version compare', () => {
  it('treats a lower node version as outdated', () => {
    expect(compareSemver('1.2.0', '1.2.1')).toBe(-1);
    expect(isOutdated('1.2.0', '1.2.1')).toBe(true);
    expect(isOutdated('1.2.1', '1.2.1')).toBe(false);
    expect(sphereCoreLabel('1.2.1')).toBe('Sphere core 1.2');
    expect(publicReleaseOutdated('Sphere core 1.2', '1.2.1')).toBe(false);
    expect(publicReleaseOutdated('Sphere core 1.2', '1.3.0')).toBe(true);
  });
});
