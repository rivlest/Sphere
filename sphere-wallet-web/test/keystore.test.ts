import { describe, expect, it } from 'vitest';
import { walletFromPrivateKey } from '../src/lib/crypto';
import { decryptKeystore, encryptKeystore, parseKeystoreJson } from '../src/lib/keystore';

const FAUCET_KEY = 'c2c4b8e6a1d3f5e7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5';

describe('keystore PBKDF2 + AES-GCM', () => {
  it('round-trips a private key', async () => {
    const wallet = walletFromPrivateKey(FAUCET_KEY);
    const file = await encryptKeystore(wallet.privateKey, wallet.address, 'correct-horse');
    expect(file.address).toBe(wallet.address);
    expect(file.salt).toMatch(/^[0-9a-f]+$/);
    expect(file.iv).toMatch(/^[0-9a-f]+$/);
    expect(file.ciphertext).toMatch(/^[0-9a-f]+$/);
    expect(JSON.stringify(file)).not.toContain(wallet.privateKey);

    const parsed = parseKeystoreJson(JSON.stringify(file));
    const decrypted = await decryptKeystore(parsed, 'correct-horse');
    expect(decrypted).toBe(wallet.privateKey);
  });

  it('rejects a wrong password', async () => {
    const wallet = walletFromPrivateKey(FAUCET_KEY);
    const file = await encryptKeystore(wallet.privateKey, wallet.address, 'correct-horse');
    await expect(decryptKeystore(file, 'wrong-password')).rejects.toThrow(/Invalid password/);
  });
});
