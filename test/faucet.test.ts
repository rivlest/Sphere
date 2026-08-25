import { describe, expect, it } from 'vitest';
import { TestFaucet } from '../src/api/faucet.js';
import { createWallet } from '../src/wallet/wallet.js';
import { ValidationError } from '../src/core/errors.js';
import { ORBS_PER_SPH } from '../src/types.js';

describe('optional test faucet', () => {
  it('signs a drip within the daily cap', () => {
    const funded = createWallet();
    const faucet = new TestFaucet(funded.privateKey, ORBS_PER_SPH);
    const alice = createWallet();
    const tx = faucet.drip(alice.address, 1_000, 1, () => ({
      balance: 50 * ORBS_PER_SPH,
      nonce: 0,
    }));
    expect(tx.to).toBe(alice.address);
    expect(tx.from).toBe(funded.address);
    expect(tx.amount).toBe(1_000);
  });

  it('rejects a second drip that would exceed the daily cap', () => {
    const funded = createWallet();
    const faucet = new TestFaucet(funded.privateKey, 1_000);
    const alice = createWallet();
    const account = () => ({ balance: 50 * ORBS_PER_SPH, nonce: 0 });
    faucet.drip(alice.address, 1_000, 1, account);
    expect(() => faucet.drip(alice.address, 1, 2, account)).toThrow(ValidationError);
  });
});
