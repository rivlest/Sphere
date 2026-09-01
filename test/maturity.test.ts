import { describe, expect, it } from 'vitest';
import { Blockchain } from '../src/core/blockchain.js';
import { createSignedTransaction } from '../src/core/transaction.js';
import { createCandidateBlock } from '../src/core/block.js';
import { mineBlock } from '../src/core/proofOfWork.js';
import { createWallet } from '../src/wallet/wallet.js';
import { ValidationError } from '../src/core/errors.js';
import { mineEmptyBlock, TEST_CONFIG } from './helpers.js';

describe('coinbase maturity', () => {
  it('rejects spending a coinbase before COINBASE_MATURITY after activation', async () => {
    const chain = await Blockchain.open({
      ...TEST_CONFIG,
      coinbaseMaturity: 100,
      coinbaseMaturityActivationHeight: 0,
    });
    const miner = createWallet();
    const alice = createWallet();
    await mineEmptyBlock(chain, miner.address);
    const tx = createSignedTransaction(
      {
        utxos: chain.getUtxos(miner.address),
        to: alice.address,
        amount: 1_000,
        fee: 1,
        changeAddress: miner.address,
      },
      miner.privateKey,
    );
    const candidate = await createCandidateBlock(chain, miner.address, [tx]);
    const mined = await mineBlock(candidate.header, { pow: chain.config.pow });
    await expect(chain.addBlock({ ...candidate, header: mined.header, hash: mined.hash })).rejects.toThrow(
      ValidationError,
    );
  });

  it('does not re-validate immature spends in history below the activation height', async () => {
    const chain = await Blockchain.open({
      ...TEST_CONFIG,
      coinbaseMaturity: 100,
      coinbaseMaturityActivationHeight: 3,
    });
    const miner = createWallet();
    const alice = createWallet();
    await mineEmptyBlock(chain, miner.address);
    const tx = createSignedTransaction(
      {
        utxos: chain.getUtxos(miner.address),
        to: alice.address,
        amount: 1_000,
        fee: 1,
        changeAddress: miner.address,
      },
      miner.privateKey,
    );
    const candidate = await createCandidateBlock(chain, miner.address, [tx]);
    const mined = await mineBlock(candidate.header, { pow: chain.config.pow });
    await chain.addBlock({ ...candidate, header: mined.header, hash: mined.hash });
    expect(chain.height).toBe(2);
    expect(chain.getAccount(alice.address).balance).toBe(1_000);
  });

  it('records height and coinbase on UTXOs', async () => {
    const chain = await Blockchain.open(TEST_CONFIG);
    const miner = createWallet();
    await mineEmptyBlock(chain, miner.address);
    const [coin] = chain.getUtxos(miner.address);
    expect(coin?.coinbase).toBe(true);
    expect(coin?.height).toBe(1);
  });
});
