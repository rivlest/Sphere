import { KEYSTORE_PBKDF2_ITERATIONS, type KeystoreFile } from '../types';
import { addressFromPrivateKey, normalizePrivateKey } from './crypto';

const SALT_BYTES = 16;
const IV_BYTES = 12;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is not available');
  }
  return subtle;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hex encoding in keystore');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: KEYSTORE_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptKeystore(
  privateKeyHex: string,
  address: string,
  password: string,
): Promise<KeystoreFile> {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const privateKey = normalizePrivateKey(privateKeyHex);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(password, salt);
  const cipher = await getSubtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(privateKey),
  );
  return {
    address,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(cipher)),
  };
}

export async function decryptKeystore(file: KeystoreFile, password: string): Promise<string> {
  if (!file?.address || !file.salt || !file.iv || !file.ciphertext) {
    throw new Error('Invalid keystore file');
  }
  const salt = hexToBytes(file.salt);
  const iv = hexToBytes(file.iv);
  const ciphertext = hexToBytes(file.ciphertext);
  const key = await deriveAesKey(password, salt);
  let plain: ArrayBuffer;
  try {
    plain = await getSubtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource);
  } catch {
    throw new Error('Invalid password or corrupted keystore');
  }
  const privateKey = normalizePrivateKey(new TextDecoder().decode(plain));
  if (addressFromPrivateKey(privateKey) !== file.address) {
    throw new Error('Keystore address does not match the decrypted key');
  }
  return privateKey;
}

export function parseKeystoreJson(text: string): KeystoreFile {
  const parsed = JSON.parse(text) as KeystoreFile;
  if (
    typeof parsed.address !== 'string' ||
    typeof parsed.salt !== 'string' ||
    typeof parsed.iv !== 'string' ||
    typeof parsed.ciphertext !== 'string'
  ) {
    throw new Error('Keystore must contain address, salt, iv, and ciphertext');
  }
  return parsed;
}
