import { describe, expect, it } from 'vitest';
import { compareSemver, isOutdated, outdatedNotice, sphereCoreLabel } from '../src/version.js';
import { checkSoftwareUpdate } from '../src/updateCheck.js';

describe('software version', () => {
  it('orders semver and flags older builds as outdated', () => {
    expect(compareSemver('1.2.0', '1.2.1')).toBe(-1);
    expect(compareSemver('1.2.1', '1.2.1')).toBe(0);
    expect(isOutdated('1.2.0', '1.2.1')).toBe(true);
    expect(isOutdated('1.2.1', '1.2.0')).toBe(false);
    expect(outdatedNotice('1.2.0', '1.2.1')).toMatch(/git pull/);
    expect(sphereCoreLabel('1.2.1')).toBe('Sphere core 1.2');
    expect(outdatedNotice('1.2.0', '1.3.0')).toContain('Sphere core 1.3');
  });

  it('returns a git pull notice when GitHub is ahead', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ version: '9.9.9' }), { status: 200 });
    const result = await checkSoftwareUpdate('1.2.1', fetchImpl as typeof fetch);
    expect(result.outdated).toBe(true);
    expect(result.latest).toBe('9.9.9');
    expect(result.notice).toContain('git pull');
  });

  it('is quiet when already current', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ version: '1.2.1' }), { status: 200 });
    const result = await checkSoftwareUpdate('1.2.1', fetchImpl as typeof fetch);
    expect(result.outdated).toBe(false);
    expect(result.notice).toBeNull();
  });
});
