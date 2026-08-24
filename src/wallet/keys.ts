import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, bytesToHex, sha256Hex } from '../core/hash.js';
import { ADDRESS_PREFIX } from '../types.js';
import { ValidationError } from '../core/errors.js';

secp.etc.hmacSha256Sync = (key, ...msgs) => hmac(sha256, key, secp.etc.concatBytes(...msgs));

export function generatePrivateKey(): string {
  return bytesToHex(secp.utils.randomPrivateKey());
}

export function getPublicKeyHex(privateKeyHex: string, compressed = true): string {
  const pub = secp.getPublicKey(hexToBytes(privateKeyHex), compressed);
  return bytesToHex(pub);
}

export function addressFromPublicKey(publicKeyHex: string): string {
  return ADDRESS_PREFIX + sha256Hex(hexToBytes(publicKeyHex)).slice(0, 40);
}

export function addressFromPrivateKey(privateKeyHex: string): string {
  return addressFromPublicKey(getPublicKeyHex(privateKeyHex));
}

export function isValidAddress(address: string): boolean {
  return new RegExp(`^${ADDRESS_PREFIX}[0-9a-f]{40}$`).test(address);
}

/** ECDSA compact signature (64 bytes) + recovery id (1 byte), hex-encoded. */
export function signHash(messageHashHex: string, privateKeyHex: string): string {
  const msg = hexToBytes(messageHashHex);
  if (msg.length !== 32) {
    throw new ValidationError('Message hash must be 32 bytes');
  }
  const signature = secp.sign(msg, hexToBytes(privateKeyHex));
  const compact = signature.toCompactRawBytes();
  const packed = new Uint8Array(65);
  packed.set(compact, 0);
  packed[64] = signature.recovery;
  return bytesToHex(packed);
}

export function recoverPublicKeyFromSignature(
  messageHashHex: string,
  signatureHex: string,
): string {
  const sigBytes = hexToBytes(signatureHex);
  if (sigBytes.length !== 65) {
    throw new ValidationError('Signature must be 65 bytes (compact + recovery)');
  }
  const compact = sigBytes.slice(0, 64);
  const recovery = sigBytes[64]!;
  const signature = secp.Signature.fromCompact(compact).addRecoveryBit(recovery);
  const pub = signature.recoverPublicKey(hexToBytes(messageHashHex));
  return bytesToHex(pub.toRawBytes(true));
}

export function verifyHashSignature(
  messageHashHex: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  try {
    const sigBytes = hexToBytes(signatureHex);
    if (sigBytes.length !== 65) return false;
    const compact = sigBytes.slice(0, 64);
    const signature = secp.Signature.fromCompact(compact);
    return secp.verify(signature, hexToBytes(messageHashHex), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}
