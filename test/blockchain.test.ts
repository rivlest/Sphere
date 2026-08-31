import { describe, expect, it } from 'vitest';
import { Blockchain } from '../src/core/blockchain.js';
import { createGenesisBlock, faucetAddress } from '../src/core/genesis.js';
import { createSignedTransaction } from '../src/core/transaction.js';
import { createCandidateBlock } from '../src/core/block.js';
import { mineBlock } from '../src/core/proofOfWork.js';
import { createWallet } from '../src/wallet/wallet.js';
import { BinaryChainStore, JsonFileChainStore } from '../src/storage/persistence.js';
import { Mempool } from '../src/mempool/mempool.js';
import { ValidationError } from '../src/core/errors.js';
import { bitsToTarget, retargetTarget, targetToBits, workRatio } from '../src/core/bits.js';
import { mineEmptyBlock, TEST_CONFIG, withTempDir } from './helpers.js';

describe('blockchain', () => {
  it('starts from the genesis block and credits the faucet', async () => {
    const chain = await Blockchain.open(TEST_CONFIG);
    const genesis = await createGenesisBlock(TEST_CONFIG);
    expect(chain.height).toBe(0);
    expect(chain.latestBlock.hash).toBe(genesis.hash);
    expect(chain.getAccount(faucetAddress()).balance).toBe(TEST_CONFIG.initialRewardOrbs);
    expect(chain.getUtxos(faucetAddress())).toHaveLength(1);
  });

  it('mines a valid successor and pays the miner', async () => {
    const chain = await Blockchain.open(TEST_CONFIG);
    const miner = createWallet();
    const block = await mineEmptyBlock(chain, miner.address);
    expect(block.header.index).toBe(1);
    expect(block.header.previousHash).toBe((await createGenesisBlock(TEST_CONFIG)).hash);
    expect(chain.getAccount(miner.address).balance).toBe(TEST_CONFIG.initialRewardOrbs);
  });

  it('applies a signed transfer and collects the fee in the coinbase', async () => {
    const chain = await Blockchain.open(TEST_CONFIG);
    const sender = createWallet();
    const alice = createWallet();
    const miner = createWallet();
    await mineEmptyBlock(chain, sender.address);
    const tx = createSignedTransaction(
      {
        utxos: chain.getUtxos(sender.address),
        to: alice.address,
        amount: 1_000_000,
        fee: 2_000,
        changeAddress: sender.address,
      },
      sender.privateKey,
    );
    const candidate = await createCandidateBlock(chain, miner.address, [tx]);
    const mined = await mineBlock(candidate.header, { pow: chain.config.pow });
    await chain.addBlock({ ...candidate, header: mined.header, hash: mined.hash });

    expect(chain.getAccount(alice.address).balance).toBe(1_000_000);
    expect(chain.getAccount(sender.address).balance).toBe(
      TEST_CONFIG.initialRewardOrbs - 1_000_000 - 2_000,
    );
    expect(chain.getAccount(miner.address).balance).toBe(TEST_CONFIG.initialRewardOrbs + 2_000);
  });

  it('tightens bits by ×1.4 after retargetInterval blocks', async () => {
    const chain = await Blockchain.open(TEST_CONFIG);
    const miner = faucetAddress();
    const genesisBits = TEST_CONFIG.initialBits;
    for (let i = 0; i < TEST_CONFIG.retargetInterval - 1; i++) {
      await mineEmptyBlock(chain, miner);
      expect(chain.latestBlock.header.bits).toBe(genesisBits);
    }
    const expected = targetToBits(retargetTarget(bitsToTarget(genesisBits)));
    expect(chain.nextBits()).toBe(expected);
    await mineEmptyBlock(chain, miner);
    expect(chain.latestBlock.header.bits).toBe(expected);
    expect(chain.height).toBe(TEST_CONFIG.retargetInterval);
    expect(chain.difficulty).toBe(workRatio(expected, genesisBits));
  });

  it('rejects a block that does not extend the tip', async () => {
    const chain = await Blockchain.open(TEST_CONFIG);
    const other = await Blockchain.open(TEST_CONFIG);
    await mineEmptyBlock(other, faucetAddress());
    await mineEmptyBlock(chain, faucetAddress());
    await expect(chain.addBlock(other.latestBlock)).rejects.toThrow(ValidationError);
  });

  it('adopts a longer valid chain', async () => {
    const shorter = await Blockchain.open(TEST_CONFIG);
    const longer = await Blockchain.open(TEST_CONFIG);
    await mineEmptyBlock(shorter, faucetAddress());
    await mineEmptyBlock(longer, faucetAddress());
    await mineEmptyBlock(longer, faucetAddress());
    expect(await shorter.replaceChain(longer.getBlocks())).toBe(true);
    expect(shorter.height).toBe(2);
  });

  it('reads old block bodies from disk after the RAM cache evicts them', async () => {
    await withTempDir(async (dir) => {
      const store = new BinaryChainStore(dir);
      const chain = await Blockchain.openArchive(TEST_CONFIG, store, 3);
      for (let i = 0; i < 8; i++) {
        await mineEmptyBlock(chain, faucetAddress());
      }
      expect(chain.height).toBe(8);
      expect(chain.getBlockByHeight(1)).toBeUndefined();
      const fromDisk = await chain.fetchBlock(1);
      expect(fromDisk?.header.index).toBe(1);
      expect(fromDisk?.hash).toBe(chain.hashAt(1));
    });
  });
});

describe('mempool', () => {
  it('rejects duplicates, coinbase, and double-spends of the same UTXO', async () => {
    const chain = await Blockchain.open(TEST_CONFIG);
    const pool = new Mempool(60_000);
    const sender = createWallet();
    await mineEmptyBlock(chain, sender.address);
    const alice = createWallet();
    const bob = createWallet();
    const utxos = chain.getUtxos(sender.address);
    const tx = createSignedTransaction(
      {
        utxos,
        to: alice.address,
        amount: 10,
        fee: 1,
        changeAddress: sender.address,
      },
      sender.privateKey,
    );
    const resolve = (txid: string, vout: number) => chain.getUtxo(txid, vout);
    pool.add(tx, resolve, (hash) => chain.hasTransaction(hash));
    expect(() => pool.add(tx, resolve, (hash) => chain.hasTransaction(hash))).toThrow(/Duplicate/);

    const conflict = createSignedTransaction(
      {
        utxos,
        to: bob.address,
        amount: 20,
        fee: 1,
        changeAddress: sender.address,
      },
      sender.privateKey,
    );
    expect(() => pool.add(conflict, resolve, () => false)).toThrow(/already spent in mempool/);

    expect(() => pool.add(chain.latestBlock.transactions[0]!, resolve, () => false)).toThrow(
      /Coinbase/,
    );
  });
});

describe('persistence', () => {
  it('writes and reloads a JSON chain snapshot', async () => {
    await withTempDir(async (dir) => {
      const chain = await Blockchain.open(TEST_CONFIG);
      await mineEmptyBlock(chain, faucetAddress());
      const store = new JsonFileChainStore(dir);
      await store.save(chain.getBlocks());
      const loaded = await store.load();
      const restored = await Blockchain.open(TEST_CONFIG, loaded ?? undefined);
      expect(restored.height).toBe(1);
      expect(restored.latestBlock.hash).toBe(chain.latestBlock.hash);
    });
  });

  it('appends blocks to chain.dat and reloads them from the index', async () => {
    await withTempDir(async (dir) => {
      const chain = await Blockchain.open(TEST_CONFIG);
      await mineEmptyBlock(chain, faucetAddress());
      const store = new BinaryChainStore(dir);
      await store.save(chain.getBlocks());
      await mineEmptyBlock(chain, faucetAddress());
      await store.save(chain.getBlocks());
      const loaded = await store.load();
      const restored = await Blockchain.open(TEST_CONFIG, loaded ?? undefined);
      expect(restored.height).toBe(2);
      expect(restored.latestBlock.hash).toBe(chain.latestBlock.hash);
      expect(restored.getAccount(faucetAddress()).balance).toBe(TEST_CONFIG.initialRewardOrbs * 3);
    });
  });
});
