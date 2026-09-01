import { describe, expect, it } from 'vitest';
import {
  createSignedTransaction,
  createWallet,
  hashTransaction,
  isValidAddress,
} from '../src/lib/crypto';
import { decodeAddress, encodeDisplayAddress, parseAddress } from '../src/lib/address';

describe('Sphere address derivation', () => {
  it('creates sph1 addresses of length 44', () => {
    const wallet = createWallet();
    expect(isValidAddress(wallet.address)).toBe(true);
    expect(wallet.address.startsWith('sph1')).toBe(true);
    expect(wallet.address).toHaveLength(44);
    expect(wallet.privateKey).toHaveLength(64);
    const display = encodeDisplayAddress(wallet.address);
    expect(decodeAddress(display)).toBe(wallet.address);
    expect(parseAddress(display).encoding).toBe('checksum');
    expect(isValidAddress(display)).toBe(true);
  });
});

describe('transaction signing', () => {
  it('hashes the canonical payload and attaches a 65-byte signature', () => {
    const sender = createWallet();
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        utxos: [
          {
            txid: 'ab'.repeat(32),
            vout: 0,
            address: sender.address,
            amount: 5_000_000_000,
          },
        ],
        to: alice.address,
        amount: 1_000_000,
        fee: 1000,
        changeAddress: sender.address,
        timestamp: 1_704_067_200_000,
      },
      sender.privateKey,
    );
    expect(tx.hash).toBe(hashTransaction(tx));
    expect(tx.inputs[0]!.signature).toHaveLength(130);
    expect(tx.outputs[0]!.address).toBe(alice.address);
  });
});
