const INVALID_BEFORE_BAN = 8;
const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** First offence 15 min; repeat within 24h → hours; next → a day. */
const BAN_MS = [15 * 60 * 1000, 4 * 60 * 60 * 1000, 24 * 60 * 60 * 1000] as const;
const DECAY = 1;

interface Score {
  invalid: number;
  bannedUntil: number;
  strike: number;
  lastBanAt: number;
}

export class PeerScore {
  private readonly scores = new Map<string, Score>();

  constructor(private readonly clock: () => number = Date.now) {}

  isBanned(peerId: string): boolean {
    const score = this.scores.get(peerId);
    if (!score) return false;
    const now = this.clock();
    if (score.bannedUntil > now) return true;
    if (score.bannedUntil !== 0) {
      score.bannedUntil = 0;
      score.invalid = 0;
    }
    return false;
  }

  noteInvalid(peerId: string): boolean {
    const now = this.clock();
    const score = this.scores.get(peerId) ?? {
      invalid: 0,
      bannedUntil: 0,
      strike: 0,
      lastBanAt: 0,
    };
    if (score.bannedUntil > now) {
      this.scores.set(peerId, score);
      return true;
    }
    if (score.bannedUntil !== 0) {
      score.bannedUntil = 0;
      score.invalid = 0;
    }
    score.invalid += 1;
    if (score.invalid >= INVALID_BEFORE_BAN) {
      if (score.lastBanAt > 0 && now - score.lastBanAt < REPEAT_WINDOW_MS) {
        score.strike = Math.min(score.strike + 1, BAN_MS.length - 1);
      } else {
        score.strike = 0;
      }
      score.lastBanAt = now;
      score.bannedUntil = now + BAN_MS[score.strike]!;
      score.invalid = 0;
    }
    this.scores.set(peerId, score);
    return this.isBanned(peerId);
  }

  noteValid(peerId: string): void {
    const score = this.scores.get(peerId);
    if (!score || score.bannedUntil > this.clock()) return;
    score.invalid = Math.max(0, score.invalid - DECAY);
  }

  banDurationMs(peerId: string): number {
    const score = this.scores.get(peerId);
    if (!score) return 0;
    return Math.max(0, score.bannedUntil - this.clock());
  }
}
