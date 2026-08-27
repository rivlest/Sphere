import { describe, expect, it } from 'vitest';
import { MarketPriceService, parseMarketPayload } from '../src/api/marketPrice.js';

describe('market price payload', () => {
  it('reads a canonical { price } quote', () => {
    expect(parseMarketPayload({ price: 0.05 }).price).toBe(0.05);
  });

  it('reads CoinGecko simple/price USD quotes', () => {
    expect(parseMarketPayload({ sphere: { usd: 0.012 } }).price).toBe(0.012);
  });

  it('rejects missing or non-positive prices', () => {
    expect(() => parseMarketPayload({ foo: 1 })).toThrow(/did not contain/);
    expect(() => parseMarketPayload({ price: 0 })).toThrow(/positive/);
    expect(() => parseMarketPayload({ price: -2 })).toThrow(/positive/);
  });
});

describe('market price service', () => {
  it('does not invent a price when no market URL is configured', async () => {
    const feed = new MarketPriceService({ url: '' });
    const quote = await feed.getQuote();
    expect(quote.available).toBe(false);
    expect(quote.price).toBeNull();
    expect(quote.history).toEqual([]);
    expect(quote.error).toBe('not_configured');
  });

  it('records real quotes and derives 1h change from them', async () => {
    let price = 0.01;
    const feed = new MarketPriceService({
      url: 'https://exchange.example/sph',
      pollIntervalMs: 0,
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ price }),
      }),
    });

    const first = await feed.getQuote(1_000);
    price = 0.012;
    const second = await feed.getQuote(3_600_000);

    expect(first.available).toBe(true);
    expect(first.price).toBe(0.01);
    expect(first.source).toBe('exchange.example');
    expect(second.price).toBe(0.012);
    expect(second.change1hPercent).toBeCloseTo(20, 5);
    expect(second.history).toHaveLength(2);
  });
});
