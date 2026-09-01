import { describe, expect, it } from 'vitest';
import {
  decodeAddress,
  decodeLegacyAddress,
  encodeDisplayAddress,
  parseAddress,
} from '../src/wallet/address.js';
import { createWallet } from '../src/wallet/wallet.js';
import { GENESIS_COINBASE_ADDRESS } from '../src/types.js';
import { ValidationError } from '../src/core/errors.js';

describe('address checksum', () => {
  it('round-trips a checksummed display address to the canonical on-chain form', () => {
    const wallet = createWallet();
    const display = encodeDisplayAddress(wallet.address);
    expect(display.startsWith('sph1')).toBe(true);
    expect(display).not.toBe(wallet.address);
    expect(decodeAddress(display)).toBe(wallet.address);
    expect(parseAddress(display)).toEqual({ canonical: wallet.address, encoding: 'checksum' });
  });

  it('decodes legacy 40-hex through an explicit path', () => {
    expect(decodeLegacyAddress(GENESIS_COINBASE_ADDRESS)).toBe(GENESIS_COINBASE_ADDRESS);
    expect(parseAddress(GENESIS_COINBASE_ADDRESS)).toEqual({
      canonical: GENESIS_COINBASE_ADDRESS,
      encoding: 'legacy',
    });
    expect(() => decodeAddress(GENESIS_COINBASE_ADDRESS)).toThrow(/legacy/i);
  });

  it('adds a checksum to already-emitted addresses without changing the key hash', () => {
    const display = encodeDisplayAddress(GENESIS_COINBASE_ADDRESS);
    expect(decodeAddress(display)).toBe(GENESIS_COINBASE_ADDRESS);
  });

  it('rejects a tampered checksum', () => {
    const display = encodeDisplayAddress(GENESIS_COINBASE_ADDRESS);
    const body = display.slice(4);
    const flipped = body[0] === '2' ? '3' + body.slice(1) : '2' + body.slice(1);
    expect(() => decodeAddress('sph1' + flipped)).toThrow(ValidationError);
  });
});
