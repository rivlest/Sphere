import { describe, expect, it } from 'vitest';
import { TestFaucet } from '../src/api/faucet.js';
import { createWallet } from '../src/wallet/wallet.js';
import { ValidationError } from '../src/core/errors.js';
import { ORBS_PER_SPH } from '../src/types.js';
import type { Utxo } from '../src/core/transaction.js';

function faucetUtxo(address: string): Utxo {
  return {
    txid: 'cd'.repeat(32),
    vout: 0,
    address,
    amount: 50 * ORBS_PER_SPH,
    height: 0,
    coinbase: false,
  };
}

describe('optional test faucet', () => {
  it('signs a drip within the daily cap', () => {
    const funded = createWallet();
    const faucet = new TestFaucet(funded.privateKey, ORBS_PER_SPH);
    const alice = createWallet();
    const tx = faucet.drip(alice.address, 1_000, [faucetUtxo(funded.address)]);
    expect(tx.outputs[0]!.address).toBe(alice.address);
    expect(tx.outputs[0]!.amount).toBe(1_000);
    expect(tx.outputs[1]!.address).toBe(funded.address);
  });

  it('rejects a second drip that would exceed the daily cap', () => {
    const funded = createWallet();
    const faucet = new TestFaucet(funded.privateKey, 1_000);
    const alice = createWallet();
    const coins = [faucetUtxo(funded.address)];
    faucet.drip(alice.address, 1_000, coins);
    expect(() => faucet.drip(alice.address, 1, coins)).toThrow(ValidationError);
  });
});
