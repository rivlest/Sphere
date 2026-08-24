import { doubleSha256Hex, concatHexHashes } from './hash.js';

/**
 * Standard Merkle root over transaction hashes (hex).
 * Odd layers duplicate the last hash before pairing.
 */
export function merkleRoot(txHashes: string[]): string {
  if (txHashes.length === 0) {
    return '0'.repeat(64);
  }

  let layer = [...txHashes];
  while (layer.length > 1) {
    if (layer.length % 2 === 1) {
      layer.push(layer[layer.length - 1]!);
    }
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(doubleSha256Hex(concatHexHashes(layer[i]!, layer[i + 1]!)));
    }
    layer = next;
  }
  return layer[0]!;
}
