import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Block } from '../types.js';
import { isAccountBasedSnapshot } from '../storage/codec.js';
import { BinaryChainStore } from '../storage/persistence.js';

const program = new Command();
program
  .name('migrate-chain')
  .description('Convert a UTXO chain.json snapshot into append-only chain.dat + chain.idx')
  .requiredOption('--from <file>', 'path to chain.json')
  .requiredOption('--to <dir>', 'output data directory')
  .action(async (cmd: { from: string; to: string }) => {
    const raw = await readFile(path.resolve(cmd.from), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Input is not a JSON array of blocks');
    }
    if (isAccountBasedSnapshot(parsed)) {
      throw new Error(
        'This file is the pre-UTXO account ledger. There is no automatic conversion to UTXO; start a new chain or wait for an explicit reset/migration decision.',
      );
    }
    const store = new BinaryChainStore(path.resolve(cmd.to));
    await store.save(parsed as Block[]);
    console.log(`Wrote ${parsed.length} blocks to ${path.resolve(cmd.to)} (chain.dat / chain.idx)`);
  });

await program.parseAsync(process.argv);
