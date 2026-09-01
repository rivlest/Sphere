import { ORBS_PER_SPH } from '../types.js';
import { ValidationError } from '../core/errors.js';
import { isValidAddress, addressFromPrivateKey } from '../wallet/keys.js';
import { parseAddress } from '../wallet/address.js';
import { createSignedTransaction, type Utxo } from '../core/transaction.js';
import type { Transaction } from '../types.js';

const DEFAULT_MAX_ORBS = ORBS_PER_SPH;

/**
 * Optional test faucet. The private key is read from SPHERE_FAUCET_PRIVATE_KEY
 * and must never be committed. Disabled when the env var is empty.
 */
export class TestFaucet {
  private readonly privateKey: string;
  private readonly from: string;
  private readonly maxOrbs: number;
  private readonly spent = new Map<string, { day: string; orbs: number }>();

  constructor(privateKey: string, maxOrbs = DEFAULT_MAX_ORBS) {
    this.privateKey = privateKey;
    this.from = addressFromPrivateKey(privateKey);
    this.maxOrbs = maxOrbs;
  }

  get fromAddress(): string {
    return this.from;
  }

  drip(to: string, amountOrbs: number, utxos: Utxo[]): Transaction {
    let canonical: string;
    try {
      canonical = parseAddress(to).canonical;
    } catch {
      throw new ValidationError('Invalid recipient address');
    }
    if (!isValidAddress(canonical)) {
      throw new ValidationError('Invalid recipient address');
    }
    if (!Number.isInteger(amountOrbs) || amountOrbs <= 0) {
      throw new ValidationError('Faucet amount must be a positive integer of Orbs');
    }
    if (amountOrbs > this.maxOrbs) {
      throw new ValidationError(`Faucet amount exceeds max ${this.maxOrbs} Orbs`);
    }

    const day = new Date().toISOString().slice(0, 10);
    const prior = this.spent.get(canonical);
    const used = prior && prior.day === day ? prior.orbs : 0;
    if (used + amountOrbs > this.maxOrbs) {
      throw new ValidationError('Faucet daily limit reached for this address');
    }

    const available = utxos.reduce((sum, utxo) => sum + utxo.amount, 0);
    if (available < amountOrbs) {
      throw new ValidationError('Faucet wallet has insufficient balance');
    }

    const tx = createSignedTransaction(
      {
        utxos,
        to: canonical,
        amount: amountOrbs,
        fee: 0,
        changeAddress: this.from,
      },
      this.privateKey,
    );
    this.spent.set(canonical, { day, orbs: used + amountOrbs });
    return tx;
  }
}

export function faucetFromEnv(): TestFaucet | null {
  const key = process.env.SPHERE_FAUCET_PRIVATE_KEY?.trim();
  if (!key) return null;
  const max = Number(process.env.SPHERE_FAUCET_MAX_ORBS ?? DEFAULT_MAX_ORBS);
  return new TestFaucet(key, Number.isInteger(max) && max > 0 ? max : DEFAULT_MAX_ORBS);
}
