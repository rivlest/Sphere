import { describe, expect, it } from 'vitest';
import { SimulatedPriceFeed, PRICE_MIN_USD } from '../src/api/simulatedPrice.js';

describe('simulated price feed', () => {
  it('never goes below the floor and stays labeled as demo', () => {
    const feed = new SimulatedPriceFeed(1_700_000_000_000);
    const snap = feed.snapshot(1_700_000_000_000 + 60_000);
    expect(snap.demo).toBe(true);
    expect(snap.source).toBe('simulated');
    expect(snap.price).toBeGreaterThanOrEqual(PRICE_MIN_USD);
    expect(snap.history.length).toBeGreaterThan(1);
  });
});
