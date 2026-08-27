import argon2 from 'argon2';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

const payload = '{"bits":536870911,"index":1,"merkleRoot":"ab","nonce":0,"previousHash":"00","timestamp":1,"version":2}';

function sha256dHs(n: number): number {
  const start = performance.now();
  const bytes = utf8ToBytes(payload);
  for (let i = 0; i < n; i++) {
    sha256(sha256(bytes));
  }
  return (n / (performance.now() - start)) * 1000;
}

async function argonHs(
  n: number,
  memoryCost: number,
  timeCost: number,
  parallelism: number,
): Promise<{ hs: number; ms: number }> {
  const salt = Buffer.from('sphere-hdr-v2pad');
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    await argon2.hash(payload, {
      type: argon2.argon2id,
      raw: true,
      hashLength: 32,
      salt,
      memoryCost,
      timeCost,
      parallelism,
    });
  }
  const elapsed = performance.now() - start;
  return { hs: (n / elapsed) * 1000, ms: elapsed / n };
}

const shaN = 50_000;
const shaHs = sha256dHs(shaN);
console.log(JSON.stringify({ algo: 'sha256d', hashes: shaN, hashesPerSec: Math.round(shaHs) }));

const candidates = [
  { memoryCost: 1024, timeCost: 1, parallelism: 1, n: 80 },
  { memoryCost: 2048, timeCost: 1, parallelism: 1, n: 60 },
  { memoryCost: 4096, timeCost: 1, parallelism: 1, n: 40 },
  { memoryCost: 8192, timeCost: 1, parallelism: 1, n: 30 },
  { memoryCost: 4096, timeCost: 2, parallelism: 1, n: 25 },
];

for (const c of candidates) {
  const { hs, ms } = await argonHs(c.n, c.memoryCost, c.timeCost, c.parallelism);
  console.log(
    JSON.stringify({
      algo: 'argon2id',
      memoryCostKiB: c.memoryCost,
      timeCost: c.timeCost,
      parallelism: c.parallelism,
      hashesPerSec: Math.round(hs * 10) / 10,
      msPerHash: Math.round(ms * 100) / 100,
      slowerThanSha256d: Math.round(shaHs / hs),
    }),
  );
}
