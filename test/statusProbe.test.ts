import { describe, expect, it } from 'vitest';
import { fetchNodeStatus, firstReachableStatus } from '../src/statusProbe.js';
import { startTestNode } from './helpers.js';

describe('status probe', () => {
  it('reads /status from a running node', async () => {
    const node = await startTestNode();
    try {
      const body = (await fetchNodeStatus(`http://127.0.0.1:${node.httpPort}`)) as {
        name: string;
        version: string;
      };
      expect(body.name).toBe('Sphere');
      expect(body.version).toBe('Sphere core 1.2');
    } finally {
      await node.stop();
    }
  });

  it('skips a dead URL and uses the next one', async () => {
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('127.0.0.1:3001')) throw new Error('ECONNREFUSED');
      return new Response(JSON.stringify({ name: 'Sphere', version: 'Sphere core 1.2' }), {
        status: 200,
      });
    }) as typeof fetch;
    const result = await firstReachableStatus(
      ['http://127.0.0.1:3001', 'http://57.128.203.234:3001'],
      fetchImpl,
    );
    expect(result.url).toBe('http://57.128.203.234:3001');
    expect((result.body as { name: string }).name).toBe('Sphere');
  });
});
