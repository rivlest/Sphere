import { describe, expect, it } from 'vitest';
import { parseCmcDetail, parseCmcProQuotes } from '../src/api/coinMarketCap.js';
import { maxSupplyOrbs } from '../src/core/units.js';
import { DEFAULT_CONFIG, ORBS_PER_SPH } from '../src/types.js';

describe('CoinMarketCap parsers', () => {
  it('accepts a CMC detail payload for SPH', () => {
    const quote = parseCmcDetail({
      data: {
        id: 99,
        name: 'Sphere',
        symbol: 'SPH',
        slug: 'sphere-l1',
        statistics: {
          price: 0.04,
          marketCap: 2_000_000,
          fullyDilutedMarketCap: 840_000,
          volume24h: 12_000,
          rank: 1840,
          circulatingSupply: 50,
          totalSupply: 50,
          maxSupply: 21_000_000,
          priceChangePercentage1h: 1.2,
          priceChangePercentage24h: -0.4,
          priceChangePercentage7d: 8,
        },
      },
    });
    expect(quote?.symbol).toBe('SPH');
    expect(quote?.marketCap).toBe(2_000_000);
    expect(quote?.url).toContain('/currencies/sphere-l1/');
  });

  it('rejects a different ticker such as SPHR', () => {
    expect(
      parseCmcDetail({
        data: {
          id: 1,
          name: 'Sphere',
          symbol: 'SPHR',
          slug: 'sphere',
          statistics: { price: 0.02 },
        },
      }),
    ).toBeNull();
  });

  it('reads official Pro API quotes keyed by symbol', () => {
    const quote = parseCmcProQuotes({
      data: {
        SPH: {
          id: 99,
          name: 'Sphere',
          symbol: 'SPH',
          slug: 'sphere-network',
          circulating_supply: 50,
          quote: {
            USD: {
              price: 0.05,
              market_cap: 2.5,
              volume_24h: 10,
              percent_change_1h: 0.1,
            },
          },
        },
      },
    });
    expect(quote?.price).toBe(0.05);
    expect(quote?.symbol).toBe('SPH');
  });
});

describe('Sphere issuance', () => {
  it('caps lifetime supply just under 21 million SPH', () => {
    const orbs = maxSupplyOrbs(DEFAULT_CONFIG.initialRewardOrbs, DEFAULT_CONFIG.halvingInterval);
    const sph = orbs / ORBS_PER_SPH;
    expect(sph).toBeGreaterThan(20_999_999);
    expect(sph).toBeLessThanOrEqual(21_000_000);
  });
});
