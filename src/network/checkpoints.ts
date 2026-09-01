/**
 * Mainnet v3 checkpoints. Incoming chains that diverge at or below the
 * highest known checkpoint are rejected. Heights after the last entry are free to reorg.
 * Do not add the live tip — it moves.
 */
export const CHECKPOINTS: readonly { height: number; hash: string }[] = [
  { height: 0, hash: '5eef15c195e8a4819401e1ac043bf617d31392e21ef9a47818bfb76cd6d50faf' },
  { height: 144, hash: '839fe57fb2c1b850368dcd3c3bd2ffd680492ee5aec1c9b17358a8d280aa5b4f' },
  { height: 1008, hash: '002282cd90aaffbeda7c2825a229422a46d2e3d462b5103ba7fbf9c4581072e8' },
  { height: 2016, hash: '023ace6b02efbfc9272628fba2c2f5dfac44e14b3faab465a91af02cf520fcf6' },
  { height: 3024, hash: '000f96de2c07ca5acb283487c0b22031ac5494b7722b4efb3b5549a57a260a00' },
  { height: 4032, hash: '00023a445dd42653f0457093413e85f2aefdfc281b14d63a155187bdc59069dd' },
  { height: 5184, hash: '0000561faeaa460c77d11dfc4b5545307306a0827815b8b49d146b9b00c4f96f' },
];

export function highestCheckpointAtOrBelow(height: number): number {
  let locked = -1;
  for (const point of CHECKPOINTS) {
    if (point.height <= height) locked = point.height;
  }
  return locked;
}

export function checkpointHashAt(height: number): string | undefined {
  return CHECKPOINTS.find((point) => point.height === height)?.hash;
}

/** Returns an error message if `hash` at `height` contradicts a checkpoint. */
export function checkpointConflict(height: number, hash: string): string | undefined {
  const expected = checkpointHashAt(height);
  if (expected && expected !== hash) {
    return `checkpoint mismatch at height ${height}`;
  }
  return undefined;
}
