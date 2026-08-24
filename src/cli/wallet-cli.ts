import { Command } from 'commander';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createWallet, walletFromPrivateKey, type Wallet } from '../wallet/wallet.js';
import { isValidAddress } from '../wallet/keys.js';
import { createSignedTransaction } from '../core/transaction.js';
import { parseSphToOrbs, formatOrbsToSph } from '../core/units.js';

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
    console.log(`Address:     ${wallet.address}`);
    console.log(`Public key:  ${wallet.publicKey}`);
    console.log(`Saved to:    ${path.resolve(cmd.out)}`);
    console.log('Keep the private key secret.');
  });

program
  .command('balance')
  .description('Fetch confirmed balance from a local node')
  .option('--wallet <file>', 'wallet JSON (used if --address is omitted)')
  .option('--address <address>', 'Sphere address')
  .requiredOption('--node <url>', 'node REST base URL, e.g. http://127.0.0.1:3001')
  .action(async (cmd: { wallet?: string; address?: string; node: string }) => {
    const address = cmd.address ?? (await loadWallet(required(cmd.wallet, '--wallet'))).address;
    if (!isValidAddress(address)) {
      throw new Error('Invalid address');
    }
    const body = await requestJson(`${trimSlash(cmd.node)}/balance/${address}`);
    console.log(`Address:    ${body.address}`);
    console.log(`Balance:    ${body.balanceSph} SPH (${body.balance} Orbs)`);
    console.log(`Nonce:      ${body.nonce}`);
    console.log(`Next nonce: ${body.nextNonce}`);
  });

program
  .command('send')
  .description('Sign and broadcast a transaction')
  .requiredOption('--wallet <file>', 'sender wallet JSON')
  .requiredOption('--to <address>', 'recipient address')
  .requiredOption('--amount <sph>', 'amount in SPH (decimal string, not float math)')
  .option('--fee <sph>', 'fee in SPH', '0.0001')
  .requiredOption('--node <url>', 'node REST base URL')
  .action(
    async (cmd: { wallet: string; to: string; amount: string; fee: string; node: string }) => {
      const wallet = await loadWallet(cmd.wallet);
      if (!isValidAddress(cmd.to)) {
        throw new Error('Invalid recipient address');
      }
      const amount = parseSphToOrbs(cmd.amount);
      const fee = parseSphToOrbs(cmd.fee);
      const base = trimSlash(cmd.node);
      const account = await requestJson(`${base}/balance/${wallet.address}`);
      const tx = createSignedTransaction(
        {
          from: wallet.address,
          to: cmd.to,
          amount,
          fee,
          nonce: Number(account.nextNonce),
        },
        wallet.privateKey,
      );
      const result = await requestJson(`${base}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      console.log(`Broadcasted ${formatOrbsToSph(amount)} SPH`);
      console.log(`Hash: ${result.hash ?? tx.hash}`);
    },
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function trimSlash(url: string): string {
  return url.replace(/\/$/, '');
}

async function loadWallet(file: string): Promise<Wallet> {
  const raw = JSON.parse(await readFile(file, 'utf8')) as Partial<Wallet>;
  if (!raw.privateKey) throw new Error('Wallet file is missing privateKey');
  return walletFromPrivateKey(raw.privateKey);
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error ?? `HTTP ${response.status}`));
  }
  return body;
}
