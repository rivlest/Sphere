import { ORBS_PER_SPH } from '../types';

/** Convert a decimal SPH string (max 8 fractional digits) to integer Orbs. */
export function parseSphToOrbs(value: string): number {
  const trimmed = value.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid SPH amount "${value}"`);
  }
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? '').padEnd(8, '0'));
  const orbs = whole * ORBS_PER_SPH + frac;
  if (!Number.isSafeInteger(orbs)) {
    throw new Error('Amount exceeds safe integer range');
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

export function shortenAddress(address: string, edge = 8): string {
  if (address.length <= edge * 2 + 3) return address;
  return `${address.slice(0, edge)}…${address.slice(-edge)}`;
}
