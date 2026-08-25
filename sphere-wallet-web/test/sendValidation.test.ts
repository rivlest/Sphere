import { describe, expect, it } from 'vitest';
import { createWallet } from '../src/lib/crypto';
import { validateSendForm } from '../src/lib/sendValidation';
import { ORBS_PER_SPH } from '../src/types';

describe('send form validation', () => {
  const sender = createWallet().address;
  const recipient = createWallet().address;
  const balance = 5 * ORBS_PER_SPH;

  it('accepts a well-formed transfer', () => {
    const result = validateSendForm({
      to: recipient,
      amountSph: '1.5',
      feeSph: '0.0001',
      sender,
      balanceOrbs: balance,
    });
    expect(result.valid).toBe(true);
    expect(result.selfTransfer).toBe(false);
    expect(result.amountOrbs).toBe(150_000_000);
  });

  it('rejects a malformed address', () => {
    const result = validateSendForm({
      to: 'not-an-address',
      amountSph: '1',
      feeSph: '0.0001',
      sender,
      balanceOrbs: balance,
    });
    expect(result.valid).toBe(false);
    expect(result.to).toBe('invalid_address');
  });

  it('warns when sending to self', () => {
    const result = validateSendForm({
      to: sender,
      amountSph: '1',
      feeSph: '0.0001',
      sender,
      balanceOrbs: balance,
    });
    expect(result.valid).toBe(true);
    expect(result.selfTransfer).toBe(true);
  });

  it('rejects amount above balance including fee', () => {
    const result = validateSendForm({
      to: recipient,
      amountSph: '5',
      feeSph: '0.0001',
      sender,
      balanceOrbs: balance,
    });
    expect(result.valid).toBe(false);
    expect(result.amount).toBe('exceeds_balance');
  });

  it('rejects zero amount', () => {
    const result = validateSendForm({
      to: recipient,
      amountSph: '0',
      feeSph: '0.0001',
      sender,
      balanceOrbs: balance,
    });
    expect(result.amount).toBe('not_positive');
  });
});
