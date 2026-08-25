import { describe, expect, it } from 'vitest';
import { faucetAddress } from '../src/core/genesis.js';
import {
  createSignedTransaction,
  hashTransaction,
  validateTransaction,
} from '../src/core/transaction.js';
import { createWallet } from '../src/wallet/wallet.js';
import { isValidAddress } from '../src/wallet/keys.js';
import { ValidationError } from '../src/core/errors.js';

describe('wallets and transactions', () => {
  it('derives a sph1 address from the public key', () => {
    const wallet = createWallet();
    expect(isValidAddress(wallet.address)).toBe(true);
    expect(wallet.address.startsWith('sph1')).toBe(true);
    expect(wallet.address).toHaveLength(44);
  });

  it('credits genesis coinbase to the published address, without a source private key', () => {
    expect(isValidAddress(faucetAddress())).toBe(true);
    expect(faucetAddress()).toBe('sph1d0301dcf451b9ecd36a431234b5460ad0f809158');
  });

  it('signs and verifies a transaction', () => {
    const sender = createWallet();
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: sender.address,
        to: alice.address,
        amount: 1_000_000,
        fee: 1000,
        nonce: 1,
      },
      sender.privateKey,
    );
    expect(tx.hash).toBe(hashTransaction(tx));
    expect(tx.signature).toHaveLength(130);
    validateTransaction(tx, () => ({ balance: 5_000_000_000, nonce: 0 }));
  });

  it('rejects an amount that is not a positive integer of Orbs', () => {
    const sender = createWallet();
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: sender.address,
        to: alice.address,
        amount: 1,
        fee: 0,
        nonce: 1,
      },
      sender.privateKey,
    );
    tx.amount = 1.5;
    expect(() => validateTransaction(tx, () => ({ balance: 100, nonce: 0 }))).toThrow(
      ValidationError,
    );
  });

  it('rejects a bad signature', () => {
    const sender = createWallet();
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: sender.address,
        to: alice.address,
        amount: 1,
        fee: 0,
        nonce: 1,
      },
      sender.privateKey,
    );
    tx.signature = '00'.repeat(65);
    expect(() => validateTransaction(tx, () => ({ balance: 100, nonce: 0 }))).toThrow(
      /Invalid transaction signature/,
    );
  });

  it('rejects a replayed nonce and overspending', () => {
    const sender = createWallet();
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: sender.address,
        to: alice.address,
        amount: 50,
        fee: 1,
        nonce: 1,
      },
      sender.privateKey,
    );
    expect(() => validateTransaction(tx, () => ({ balance: 100, nonce: 1 }))).toThrow(
      /Invalid nonce/,
    );
    expect(() => validateTransaction(tx, () => ({ balance: 10, nonce: 0 }))).toThrow(
      /Insufficient balance/,
    );
  });
});
