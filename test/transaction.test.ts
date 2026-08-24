import { describe, expect, it } from 'vitest';
import { DEV_PRIVATE_KEY_HEX } from '../src/types.js';
import { faucetAddress } from '../src/core/genesis.js';
import {
  createSignedTransaction,
  hashTransaction,
  validateTransaction,
} from '../src/core/transaction.js';
import { createWallet, walletFromPrivateKey } from '../src/wallet/wallet.js';
import { isValidAddress } from '../src/wallet/keys.js';
import { ValidationError } from '../src/core/errors.js';

describe('wallets and transactions', () => {
  it('derives a sph1 address from the public key', () => {
    const wallet = createWallet();
    expect(isValidAddress(wallet.address)).toBe(true);
    expect(wallet.address.startsWith('sph1')).toBe(true);
    expect(wallet.address).toHaveLength(44);
  });

  it('round-trips the faucet key to the genesis address', () => {
    const faucet = walletFromPrivateKey(DEV_PRIVATE_KEY_HEX);
    expect(faucet.address).toBe(faucetAddress());
  });

  it('signs and verifies a transaction', () => {
    const faucet = walletFromPrivateKey(DEV_PRIVATE_KEY_HEX);
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: faucet.address,
        to: alice.address,
        amount: 1_000_000,
        fee: 1000,
        nonce: 1,
      },
      faucet.privateKey,
    );
    expect(tx.hash).toBe(hashTransaction(tx));
    expect(tx.signature).toHaveLength(130);
    validateTransaction(tx, () => ({ balance: 5_000_000_000, nonce: 0 }));
  });

  it('rejects an amount that is not a positive integer of Orbs', () => {
    const faucet = walletFromPrivateKey(DEV_PRIVATE_KEY_HEX);
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: faucet.address,
        to: alice.address,
        amount: 1,
        fee: 0,
        nonce: 1,
      },
      faucet.privateKey,
    );
    tx.amount = 1.5;
    expect(() => validateTransaction(tx, () => ({ balance: 100, nonce: 0 }))).toThrow(
      ValidationError,
    );
  });

  it('rejects a bad signature', () => {
    const faucet = walletFromPrivateKey(DEV_PRIVATE_KEY_HEX);
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: faucet.address,
        to: alice.address,
        amount: 1,
        fee: 0,
        nonce: 1,
      },
      faucet.privateKey,
    );
    tx.signature = '00'.repeat(65);
    expect(() => validateTransaction(tx, () => ({ balance: 100, nonce: 0 }))).toThrow(
      /Invalid transaction signature/,
    );
  });

  it('rejects a replayed nonce and overspending', () => {
    const faucet = walletFromPrivateKey(DEV_PRIVATE_KEY_HEX);
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: faucet.address,
        to: alice.address,
        amount: 50,
        fee: 1,
        nonce: 1,
      },
      faucet.privateKey,
    );
    expect(() => validateTransaction(tx, () => ({ balance: 100, nonce: 1 }))).toThrow(
      /Invalid nonce/,
    );
    expect(() => validateTransaction(tx, () => ({ balance: 10, nonce: 0 }))).toThrow(
      /Insufficient balance/,
    );
  });
});
