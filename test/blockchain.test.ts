import { describe, expect, it } from 'vitest';
import { Blockchain } from '../src/core/blockchain.js';
import { createGenesisBlock, faucetAddress } from '../src/core/genesis.js';
import { createSignedTransaction } from '../src/core/transaction.js';
import { createCandidateBlock } from '../src/core/block.js';
import { mineBlock } from '../src/core/proofOfWork.js';
import { walletFromPrivateKey, createWallet } from '../src/wallet/wallet.js';
import { DEV_PRIVATE_KEY_HEX } from '../src/types.js';
import { JsonFileChainStore } from '../src/storage/persistence.js';
import { Mempool } from '../src/mempool/mempool.js';
import { ValidationError } from '../src/core/errors.js';
import { mineEmptyBlock, TEST_CONFIG, withTempDir } from './helpers.js';

describe('blockchain', () => {
  it('starts from the genesis block and credits the faucet', () => {
    const chain = new Blockchain(TEST_CONFIG);
    const genesis = createGenesisBlock(TEST_CONFIG);
    expect(chain.height).toBe(0);
    expect(chain.latestBlock.hash).toBe(genesis.hash);
    expect(chain.getAccount(faucetAddress()).balance).toBe(TEST_CONFIG.initialRewardOrbs);
  });

  it('mines a valid successor and pays the miner', async () => {
    const chain = new Blockchain(TEST_CONFIG);
    const miner = createWallet();
    const block = await mineEmptyBlock(chain, miner.address);
    expect(block.header.index).toBe(1);
    expect(block.header.previousHash).toBe(createGenesisBlock(TEST_CONFIG).hash);
    expect(chain.getAccount(miner.address).balance).toBe(TEST_CONFIG.initialRewardOrbs);
  });

  it('applies a signed transfer and collects the fee in the coinbase', async () => {
    const chain = new Blockchain(TEST_CONFIG);
    const faucet = walletFromPrivateKey(DEV_PRIVATE_KEY_HEX);
    const alice = createWallet();
    const miner = createWallet();
    const tx = createSignedTransaction(
      {
        from: faucet.address,
        to: alice.address,
        amount: 1_000_000,
        fee: 2_000,
        nonce: 1,
      },
      faucet.privateKey,
    );
    const candidate = createCandidateBlock(chain, miner.address, [tx]);
    const mined = await mineBlock(candidate.header);
    chain.addBlock({ ...candidate, header: mined.header, hash: mined.hash });

    expect(chain.getAccount(alice.address).balance).toBe(1_000_000);
    expect(chain.getAccount(faucet.address).balance).toBe(
      TEST_CONFIG.initialRewardOrbs - 1_000_000 - 2_000,
    );
    expect(chain.getAccount(miner.address).balance).toBe(TEST_CONFIG.initialRewardOrbs + 2_000);
    expect(chain.getAccount(faucet.address).nonce).toBe(1);
  });

  it('raises difficulty after 10 blocks mined far faster than the target', async () => {
    const chain = new Blockchain(TEST_CONFIG);
    const miner = faucetAddress();
    for (let i = 0; i < 9; i++) {
      await mineEmptyBlock(chain, miner);
      expect(chain.latestBlock.header.difficulty).toBe(1);
    }
    expect(chain.nextDifficulty()).toBe(2);
    await mineEmptyBlock(chain, miner);
    expect(chain.latestBlock.header.difficulty).toBe(2);
    expect(chain.height).toBe(10);
  });

  it('rejects a block that does not extend the tip', async () => {
    const chain = new Blockchain(TEST_CONFIG);
    const other = new Blockchain(TEST_CONFIG);
    await mineEmptyBlock(other, faucetAddress());
    await mineEmptyBlock(chain, faucetAddress());
    expect(() => chain.addBlock(other.latestBlock)).toThrow(ValidationError);
  });

  it('adopts a longer valid chain', async () => {
    const shorter = new Blockchain(TEST_CONFIG);
    const longer = new Blockchain(TEST_CONFIG);
    await mineEmptyBlock(shorter, faucetAddress());
    await mineEmptyBlock(longer, faucetAddress());
    await mineEmptyBlock(longer, faucetAddress());
    expect(shorter.replaceChain(longer.getBlocks())).toBe(true);
    expect(shorter.height).toBe(2);
  });
});

describe('mempool', () => {
  it('rejects duplicates and coinbase transactions', () => {
    const chain = new Blockchain(TEST_CONFIG);
    const pool = new Mempool(60_000);
    const faucet = walletFromPrivateKey(DEV_PRIVATE_KEY_HEX);
    const alice = createWallet();
    const tx = createSignedTransaction(
      {
        from: faucet.address,
        to: alice.address,
        amount: 10,
        fee: 1,
        nonce: 1,
      },
      faucet.privateKey,
    );
    pool.add(
      tx,
      (address) => chain.getAccount(address),
      (hash) => chain.hasTransaction(hash),
    );
    expect(() =>
      pool.add(
        tx,
        (address) => chain.getAccount(address),
        (hash) => chain.hasTransaction(hash),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      pool.add(
        chain.latestBlock.transactions[0]!,
        (address) => chain.getAccount(address),
        () => false,
      ),
    ).toThrow(/Coinbase/);
  });
});

describe('persistence', () => {
  it('writes and reloads a chain snapshot', async () => {
    await withTempDir(async (dir) => {
      const chain = new Blockchain(TEST_CONFIG);
      await mineEmptyBlock(chain, faucetAddress());
      const store = new JsonFileChainStore(dir);
      await store.save(chain.getBlocks());
      const loaded = await store.load();
      const restored = new Blockchain(TEST_CONFIG, loaded ?? undefined);
      expect(restored.height).toBe(1);
      expect(restored.latestBlock.hash).toBe(chain.latestBlock.hash);
    });
  });
});
