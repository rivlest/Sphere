const BAN_AFTER = 8;
const BAN_MS = 15 * 60 * 1000;
const DECAY = 1;

interface Score {
  invalid: number;
  bannedUntil: number;
}

export class PeerScore {
  private readonly scores = new Map<string, Score>();

  isBanned(peerId: string): boolean {
    const score = this.scores.get(peerId);
    if (!score) return false;
    if (score.bannedUntil > Date.now()) return true;
    if (score.bannedUntil !== 0) {
      score.bannedUntil = 0;
      score.invalid = 0;
    }
    return false;
  }

  noteInvalid(peerId: string): boolean {
    const score = this.scores.get(peerId) ?? { invalid: 0, bannedUntil: 0 };
    score.invalid += 1;
    if (score.invalid >= BAN_AFTER) {
      score.bannedUntil = Date.now() + BAN_MS;
    }
    this.scores.set(peerId, score);
    return this.isBanned(peerId);
  }

  noteValid(peerId: string): void {
    const score = this.scores.get(peerId);
    if (!score || score.bannedUntil > Date.now()) return;
    score.invalid = Math.max(0, score.invalid - DECAY);
  }
}
