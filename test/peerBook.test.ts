import { describe, expect, it } from 'vitest';
import { PeerBook, isPeerUrl } from '../src/network/peerBook.js';
import { withTempDir } from './helpers.js';

describe('peer book', () => {
  it('accepts ws URLs and persists them', async () => {
    await withTempDir(async (dir) => {
      const book = new PeerBook(dir);
      expect(book.add('ws://192.0.2.1:6001')).toBe(true);
      expect(book.add('not-a-url')).toBe(false);
      await book.save();
      const loaded = new PeerBook(dir);
      await loaded.load();
      expect(loaded.list()).toEqual(['/ip4/192.0.2.1/tcp/6001/ws']);
    });
  });

  it('drops a peer after repeated failures', async () => {
    await withTempDir(async (dir) => {
      const book = new PeerBook(dir);
      book.add('ws://127.0.0.1:59999');
      for (let i = 0; i < 5; i++) book.markFailure('ws://127.0.0.1:59999');
      expect(book.list()).toEqual([]);
    });
  });

  it('rejects non-websocket URLs', () => {
    expect(isPeerUrl('http://example.com')).toBe(false);
    expect(isPeerUrl('wss://seed.example:6001')).toBe(true);
  });
});
