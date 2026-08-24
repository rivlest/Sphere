import { ORBS_PER_SPH } from '../types.js';
import { ValidationError } from './errors.js';

/** Convert a decimal SPH string (max 8 fractional digits) to integer Orbs. */
export function parseSphToOrbs(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(trimmed);
  if (!match) {
    throw new ValidationError(`Invalid SPH amount "${value}"`);
  }
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? '').padEnd(8, '0'));
  const orbs = whole * ORBS_PER_SPH + frac;
  if (!Number.isSafeInteger(orbs)) {
    throw new ValidationError('Amount exceeds safe integer range');
  }
  return orbs;
}

export function formatOrbsToSph(orbs: number): string {
  const sign = orbs < 0 ? '-' : '';
  const abs = Math.abs(orbs);
  const whole = Math.floor(abs / ORBS_PER_SPH);
  const frac = abs % ORBS_PER_SPH;
  if (frac === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(frac).padStart(8, '0').replace(/0+$/, '')}`;
}

export function blockRewardOrbs(
  height: number,
  initialRewardOrbs: number,
  halvingInterval: number,
): number {
  if (height < 0) return 0;
  const halvings = Math.floor(height / halvingInterval);
  if (halvings >= 53) return 0;
  return Math.floor(initialRewardOrbs / 2 ** halvings);
}
