import { Command } from 'commander';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createWallet, walletFromPrivateKey, type Wallet } from '../wallet/wallet.js';
import { encodeDisplayAddress, parseAddress } from '../wallet/address.js';
import { createSignedTransaction } from '../core/transaction.js';
import { parseSphToOrbs, formatOrbsToSph } from '../core/units.js';
import { LOCAL_REST } from '../network/seeds.js';
import { nodeUnreachableMessage, resolveRestUrl, restUrlWasExplicit } from '../wallet/rest.js';
import { SPHERE_VERSION, isOutdated, outdatedNotice } from '../version.js';
import { fetchPublishedVersion } from '../updateCheck.js';

const program = new Command();
program.name('wallet-cli').description('Sphere wallet utilities');

program
  .command('generate')
  .description('Create a new secp256k1 wallet')
  .option('--out <file>', 'output JSON path', 'wallet.json')
  .action(async (cmd: { out: string }) => {
    const wallet = createWallet();
    await mkdir(path.dirname(path.resolve(cmd.out)), { recursive: true });
    await writeFile(cmd.out, `${JSON.stringify(wallet, null, 2)}\n`, 'utf8');
    console.log(`Address:     ${encodeDisplayAddress(wallet.address)}`);
    console.log(`Canonical:   ${wallet.address}`);
    console.log(`Public key:  ${wallet.publicKey}`);
    console.log(`Saved to:    ${path.resolve(cmd.out)}`);
    console.log('Keep the private key secret. JSON stores the canonical on-chain address.');
  });

program
  .command('balance')
  .description('Fetch confirmed balance from a node')
  .option('--wallet <file>', 'wallet JSON (used if --address is omitted)')
  .option('--address <address>', 'Sphere address')
  .option('--node <url>', 'node REST base URL', LOCAL_REST)
  .action(async (cmd: { wallet?: string; address?: string; node: string }) => {
    const parsed = parseAddress(
      cmd.address ?? (await loadWallet(required(cmd.wallet, '--wallet'))).address,
    );
    if (parsed.encoding === 'legacy') {
      console.error(
        `legacy decode: ${parsed.canonical} → ${encodeDisplayAddress(parsed.canonical)}`,
      );
    }
    const base = await resolveRestUrl(cmd.node, restUrlWasExplicit());
    await warnIfOutdated(base);
    const body = await requestJson(`${base}/balance/${parsed.canonical}`);
    console.log(`Node:       ${base}`);
    console.log(`Address:    ${encodeDisplayAddress(parsed.canonical)}`);
    console.log(`Canonical:  ${parsed.canonical}`);
    console.log(`Balance:    ${body.balanceSph} SPH (${body.balance} Orbs)`);
    const utxos = Array.isArray(body.utxos) ? body.utxos.length : 0;
    console.log(`UTXOs:      ${utxos}`);
  });

program
  .command('send')
  .description('Sign and broadcast a transaction')
  .requiredOption('--wallet <file>', 'sender wallet JSON')
  .requiredOption('--to <address>', 'recipient address')
  .requiredOption('--amount <sph>', 'amount in SPH (decimal string, not float math)')
  .option('--fee <sph>', 'fee in SPH', '0.0001')
  .option('--node <url>', 'node REST base URL', LOCAL_REST)
  .action(
    async (cmd: { wallet: string; to: string; amount: string; fee: string; node: string }) => {
      const wallet = await loadWallet(cmd.wallet);
      const to = parseAddress(cmd.to);
      if (to.encoding === 'legacy') {
        console.error(`legacy decode: ${to.canonical} → ${encodeDisplayAddress(to.canonical)}`);
      }
      const amount = parseSphToOrbs(cmd.amount);
      const fee = parseSphToOrbs(cmd.fee);
      const base = await resolveRestUrl(cmd.node, restUrlWasExplicit());
      await warnIfOutdated(base);
      const account = await requestJson(`${base}/balance/${wallet.address}`);
      const utxos = (account.utxos ?? []) as Array<{
        txid: string;
        vout: number;
        address: string;
        amount: number;
        height: number;
        coinbase: boolean;
      }>;
      const tx = createSignedTransaction(
        {
          utxos,
          to: to.canonical,
          amount,
          fee,
          changeAddress: wallet.address,
        },
        wallet.privateKey,
      );
      const result = await requestJson(`${base}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      console.log(`Node:        ${base}`);
      console.log(`Broadcasted ${formatOrbsToSph(amount)} SPH`);
      console.log(`Hash: ${result.hash ?? tx.hash}`);
    },
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function warnIfOutdated(nodeBase: string): Promise<void> {
  try {
    const published = await fetchPublishedVersion();
    const status = await requestJson(`${nodeBase}/status`);
    const nodeVersion = typeof status.version === 'string' ? status.version : null;
    if (!nodeVersion) {
      console.error('outdated: this node has no version field. Update with: git pull');
      return;
    }
    if (published && isOutdated(SPHERE_VERSION, published)) {
      console.error(outdatedNotice(SPHERE_VERSION, published));
    }
    const nodeLooksLikeRawSemver = /^\d+\.\d+\.\d+$/.test(nodeVersion.trim());
    if (status.outdated === true) {
      console.error(outdatedNotice(nodeVersion, published ?? nodeVersion));
    } else if (published && nodeLooksLikeRawSemver && isOutdated(nodeVersion, published)) {
      console.error(outdatedNotice(nodeVersion, published));
    }
  } catch {
    // Status or GitHub unreachable — do not block balance/send.
  }
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

async function loadWallet(file: string): Promise<Wallet> {
  const raw = JSON.parse(await readFile(file, 'utf8')) as Partial<Wallet>;
  if (!raw.privateKey) throw new Error('Wallet file is missing privateKey');
  return walletFromPrivateKey(raw.privateKey);
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    const origin = new URL(url).origin;
    throw new Error(nodeUnreachableMessage(origin));
  }
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error ?? `HTTP ${response.status}`));
  }
  return body;
}
