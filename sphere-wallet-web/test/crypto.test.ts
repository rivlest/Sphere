import { describe, expect, it } from 'vitest';
import {
  addressFromPrivateKey,
  createSignedTransaction,
  createWallet,
  hashTransaction,
  isValidAddress,
  walletFromPrivateKey,
} from '../src/lib/crypto';

/** Public local-network faucet key from the Sphere node (never use outside tests). */
const FAUCET_KEY = 'c2c4b8e6a1d3f5e7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5';
const FAUCET_ADDRESS = 'sph1d0301dcf451b9ecd36a431234b5460ad0f809158';

describe('Sphere address derivation', () => {
  it('matches the node faucet vector: sph1 + sha256(pubkey)[:40]', () => {
    expect(addressFromPrivateKey(FAUCET_KEY)).toBe(FAUCET_ADDRESS);
    expect(walletFromPrivateKey(FAUCET_KEY).address).toBe(FAUCET_ADDRESS);
  });

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
    const faucet = walletFromPrivateKey(FAUCET_KEY);
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: faucet.address,
        to: alice.address,
        amount: 1_000_000,
        fee: 1000,
        nonce: 1,
        timestamp: 1_704_067_200_000,
      },
      faucet.privateKey,
    );
    expect(tx.hash).toBe(hashTransaction(tx));
    expect(tx.signature).toHaveLength(130);
    expect(tx.from).toBe(FAUCET_ADDRESS);
  });
});
