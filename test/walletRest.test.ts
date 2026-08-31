import { describe, expect, it } from 'vitest';
import { restUrlWasExplicit, resolveRestUrl } from '../src/wallet/rest.js';

describe('wallet REST picker', () => {
  it('detects an explicit --node flag', () => {
    expect(restUrlWasExplicit(['node', '--node', 'http://example:3001'])).toBe(true);
    expect(restUrlWasExplicit(['node', 'balance'])).toBe(false);
  });

  it('falls back to the seed when local is down', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.startsWith('http://127.0.0.1:3001')) {
        throw new TypeError('fetch failed');
      }
      return new Response(JSON.stringify({ name: 'Sphere' }), { status: 200 });
    };
    const base = await resolveRestUrl('http://127.0.0.1:3001', false, fetchImpl as typeof fetch);
    expect(base).toBe('http://57.128.203.234:3001');
    expect(calls[0]).toContain('127.0.0.1');
    expect(calls[1]).toContain('57.128.203.234');
  });

  it('explains when both local and seed are down', async () => {
    const fetchImpl = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(
      resolveRestUrl('http://127.0.0.1:3001', false, fetchImpl as typeof fetch),
    ).rejects.toThrow(/npm run start/);
  });

  it('does not fall back when --node is explicit', async () => {
    const fetchImpl = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(
      resolveRestUrl('http://127.0.0.1:3001', true, fetchImpl as typeof fetch),
    ).rejects.toThrow(/127\.0\.0\.1/);
  });
});
