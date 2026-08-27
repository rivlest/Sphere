import { describe, expect, it } from 'vitest';
import { faucetAddress } from '../src/core/genesis.js';
import {
  createSignedTransaction,
  hashTransaction,
  validateTransaction,
  type Utxo,
} from '../src/core/transaction.js';
import { createWallet } from '../src/wallet/wallet.js';
import { isValidAddress } from '../src/wallet/keys.js';
import { ValidationError } from '../src/core/errors.js';

function utxoFor(address: string, amount: number): Utxo {
  return { txid: 'ab'.repeat(32), vout: 0, address, amount };
}

function resolve(utxo: Utxo) {
  return (txid: string, vout: number) =>
    txid === utxo.txid && vout === utxo.vout ? utxo : undefined;
}

describe('wallets and transactions', () => {
  it('derives a sph1 address from the public key', () => {
    const wallet = createWallet();
    expect(isValidAddress(wallet.address)).toBe(true);
    expect(wallet.address.startsWith('sph1')).toBe(true);
    expect(wallet.address).toHaveLength(44);
  });

  it('credits genesis coinbase to the published address, without a source private key', () => {
    expect(isValidAddress(faucetAddress())).toBe(true);
    expect(faucetAddress()).toBe('sph10252f9a9770a9c19606a2a72b776c59e7bb597c6');
  });

  it('signs and verifies a transaction', () => {
    const sender = createWallet();
    const alice = createWallet();
    const coin = utxoFor(sender.address, 5_000_000_000);
    const tx = createSignedTransaction(
      {
        utxos: [coin],
        to: alice.address,
        amount: 1_000_000,
        fee: 1000,
        changeAddress: sender.address,
      },
      sender.privateKey,
    );
    expect(tx.hash).toBe(hashTransaction(tx));
    expect(tx.inputs[0]!.signature).toHaveLength(130);
    expect(tx.outputs[0]).toEqual({ address: alice.address, amount: 1_000_000 });
    validateTransaction(tx, resolve(coin));
  });

  it('rejects an amount that is not a positive integer of Orbs', () => {
    const sender = createWallet();
    const alice = createWallet();
    const coin = utxoFor(sender.address, 100);
    const tx = createSignedTransaction(
      {
        utxos: [coin],
        to: alice.address,
        amount: 1,
        fee: 0,
        changeAddress: sender.address,
      },
      sender.privateKey,
    );
    tx.outputs[0]!.amount = 1.5;
    expect(() => validateTransaction(tx, resolve(coin))).toThrow(ValidationError);
  });

  it('rejects a bad signature', () => {
    const sender = createWallet();
    const alice = createWallet();
    const coin = utxoFor(sender.address, 100);
    const tx = createSignedTransaction(
      {
        utxos: [coin],
        to: alice.address,
        amount: 1,
        fee: 0,
        changeAddress: sender.address,
      },
      sender.privateKey,
    );
    tx.inputs[0]!.signature = '00'.repeat(65);
    expect(() => validateTransaction(tx, resolve(coin))).toThrow(/Invalid transaction signature/);
  });

  it('rejects a missing UTXO and overspending', () => {
    const sender = createWallet();
    const alice = createWallet();
    const coin = utxoFor(sender.address, 100);
    const tx = createSignedTransaction(
      {
        utxos: [coin],
        to: alice.address,
        amount: 50,
        fee: 1,
        changeAddress: sender.address,
      },
      sender.privateKey,
    );
    expect(() => validateTransaction(tx, () => undefined)).toThrow(/Spent or missing UTXO/);
    expect(() =>
      validateTransaction(tx, resolve({ ...coin, amount: 10 })),
    ).toThrow(/Outputs exceed inputs/);
  });
});
