import { describe, expect, it } from 'vitest';
import { CHECKPOINTS, checkpointConflict, highestCheckpointAtOrBelow } from '../src/network/checkpoints.js';
import { PeerScore } from '../src/network/peerScore.js';

describe('checkpoints', () => {
  it('locks genesis and known mainnet heights', () => {
    expect(CHECKPOINTS[0]?.height).toBe(0);
    expect(highestCheckpointAtOrBelow(0)).toBe(0);
    expect(highestCheckpointAtOrBelow(200)).toBe(144);
    expect(checkpointConflict(0, CHECKPOINTS[0]!.hash)).toBeUndefined();
    expect(checkpointConflict(0, '00'.repeat(32))).toMatch(/checkpoint/);
  });
});

describe('peer score', () => {
  it('bans a peer after repeated invalid messages', () => {
    const scores = new PeerScore();
    expect(scores.isBanned('peer-a')).toBe(false);
    for (let i = 0; i < 7; i++) scores.noteInvalid('peer-a');
    expect(scores.isBanned('peer-a')).toBe(false);
    expect(scores.noteInvalid('peer-a')).toBe(true);
    expect(scores.isBanned('peer-a')).toBe(true);
  });

  it('escalates the ban when the same peer offends again within 24h', () => {
    let now = 1_000_000;
    const scores = new PeerScore(() => now);
    for (let i = 0; i < 8; i++) scores.noteInvalid('flood');
    expect(scores.banDurationMs('flood')).toBe(15 * 60 * 1000);

    now += 15 * 60 * 1000 + 1;
    expect(scores.isBanned('flood')).toBe(false);
    for (let i = 0; i < 8; i++) scores.noteInvalid('flood');
    expect(scores.banDurationMs('flood')).toBe(4 * 60 * 60 * 1000);

    now += 4 * 60 * 60 * 1000 + 1;
    for (let i = 0; i < 8; i++) scores.noteInvalid('flood');
    expect(scores.banDurationMs('flood')).toBe(24 * 60 * 60 * 1000);
  });
});
