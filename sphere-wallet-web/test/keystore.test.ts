import { describe, expect, it } from 'vitest';
import { createWallet } from '../src/lib/crypto';
import { decryptKeystore, encryptKeystore, parseKeystoreJson } from '../src/lib/keystore';

describe('keystore PBKDF2 + AES-GCM', () => {
  it('round-trips a private key', async () => {
    const wallet = createWallet();
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
    const wallet = createWallet();
    const file = await encryptKeystore(wallet.privateKey, wallet.address, 'correct-horse');
    await expect(decryptKeystore(file, 'wrong-password')).rejects.toThrow(/Invalid password/);
  });
});
