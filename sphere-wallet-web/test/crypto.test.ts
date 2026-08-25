import { describe, expect, it } from 'vitest';
import {
  createSignedTransaction,
  createWallet,
  hashTransaction,
  isValidAddress,
} from '../src/lib/crypto';

describe('Sphere address derivation', () => {
  it('creates sph1 addresses of length 44', () => {
    const wallet = createWallet();
    expect(isValidAddress(wallet.address)).toBe(true);
    expect(wallet.address.startsWith('sph1')).toBe(true);
    expect(wallet.address).toHaveLength(44);
    expect(wallet.privateKey).toHaveLength(64);
  });
});

describe('transaction signing', () => {
  it('hashes the canonical payload and attaches a 65-byte signature', () => {
    const sender = createWallet();
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: sender.address,
        to: alice.address,
        amount: 1_000_000,
        fee: 1000,
        nonce: 1,
        timestamp: 1_704_067_200_000,
      },
      sender.privateKey,
    );
    expect(tx.hash).toBe(hashTransaction(tx));
    expect(tx.signature).toHaveLength(130);
    expect(tx.from).toBe(sender.address);
  });
});
