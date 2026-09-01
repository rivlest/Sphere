import { describe, expect, it } from 'vitest';
import { assertWillJoinNetwork } from '../src/cli/networkGuard.js';

describe('private-fork guard', () => {
  it('stops when --no-default-seeds is set without --peers', () => {
    expect(() => assertWillJoinNetwork(false, [])).toThrow(/nie połączy się z istniejącą siecią/);
  });

  it('allows an isolated test node equivalent when peers are listed', () => {
    expect(() => assertWillJoinNetwork(false, ['ws://127.0.0.1:6001'])).not.toThrow();
  });

  it('allows the default public seed list', () => {
    expect(() => assertWillJoinNetwork(true, [])).not.toThrow();
  });
});
