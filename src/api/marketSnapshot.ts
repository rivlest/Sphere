import { NETWORK_NAME, ORBS_PER_SPH, TICKER } from '../types.js';
import { formatOrbsToSph, maxSupplyOrbs } from '../core/units.js';
import type { SphereNode } from '../node.js';
import { fetchCmcQuote } from './coinMarketCap.js';
import { marketPrice, type PricePoint } from './marketPrice.js';

export interface MarketSnapshot {
  name: string;
  symbol: string;
  listed: boolean;
  source: 'coinmarketcap' | 'onchain' | 'hybrid';
  cmcUrl: string | null;
  available: boolean;
  currency: 'USD';
  price: number | null;
  change1hPercent: number | null;
  change24hPercent: number | null;
  change7dPercent: number | null;
  marketCap: number | null;
  fullyDilutedMarketCap: number | null;
  volume24h: number | null;
  rank: number | null;
  marketPairs: number | null;
  circulatingSupply: number;
  circulatingSupplyLabel: string;
  totalSupply: number;
  maxSupply: number;
  maxSupplyLabel: string;
  holders: number;
  height: number;
  history: PricePoint[];
  updatedAt: number;
  pollIntervalMs: number;
  error?: string;
}

export async function buildMarketSnapshot(node: SphereNode): Promise<MarketSnapshot> {
  const supply = node.blockchain.getSupplyStats();
  const circulating = supply.circulatingOrbs / ORBS_PER_SPH;
  const max =
    maxSupplyOrbs(node.config.initialRewardOrbs, node.config.halvingInterval) / ORBS_PER_SPH;
  const [cmc, quote] = await Promise.all([fetchCmcQuote(), marketPrice.getQuote()]);

  const price = cmc?.price ?? quote.price;
  const change1h = cmc?.percentChange1h ?? quote.change1hPercent;
  const marketCap = cmc?.marketCap ?? (price !== null ? price * circulating : null);
  const fdv = cmc?.fullyDilutedMarketCap ?? (price !== null ? price * max : null);

  const listed = Boolean(cmc);
  const source: MarketSnapshot['source'] =
    listed && quote.available ? 'hybrid' : listed ? 'coinmarketcap' : 'onchain';

  return {
    name: NETWORK_NAME,
    symbol: TICKER,
    listed,
    source,
    cmcUrl: cmc?.url ?? 'https://coinmarketcap.com/',
    available: price !== null,
    currency: 'USD',
    price,
    change1hPercent: change1h,
    change24hPercent: cmc?.percentChange24h ?? null,
    change7dPercent: cmc?.percentChange7d ?? null,
    marketCap,
    fullyDilutedMarketCap: fdv,
    volume24h: cmc?.volume24h ?? null,
    rank: cmc?.rank ?? null,
    marketPairs: cmc?.marketPairs ?? null,
    circulatingSupply: circulating,
    circulatingSupplyLabel: formatOrbsToSph(supply.circulatingOrbs),
    totalSupply: circulating,
    maxSupply: max,
    maxSupplyLabel: formatOrbsToSph(
      maxSupplyOrbs(node.config.initialRewardOrbs, node.config.halvingInterval),
    ),
    holders: supply.holders,
    height: node.blockchain.height,
    history: quote.history,
    updatedAt: quote.updatedAt ?? Date.now(),
    pollIntervalMs: Math.max(quote.pollIntervalMs, 15_000),
    error: listed ? undefined : quote.error,
  };
}
