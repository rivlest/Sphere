/**
 * CoinMarketCap market data for SPH.
 * Uses the official Pro API when CMC_API_KEY is set, otherwise the public
 * data-api. Never maps a different ticker (e.g. SPHR) onto Sphere SPH.
 */

const CMC_PUBLIC_DETAIL = 'https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail';
const CMC_PRO_QUOTES = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';
const CACHE_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const EXPECTED_SYMBOL = 'SPH';

export interface CmcQuote {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  rank: number | null;
  price: number | null;
  marketCap: number | null;
  fullyDilutedMarketCap: number | null;
  volume24h: number | null;
  percentChange1h: number | null;
  percentChange24h: number | null;
  percentChange7d: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  marketPairs: number | null;
  lastUpdated: string | null;
  url: string;
}

type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let cached: { at: number; quote: CmcQuote | null } | null = null;
let inflight: Promise<CmcQuote | null> | null = null;

export function cmcConfig(): { apiKey: string; slug: string; id: string } {
  return {
    apiKey: (process.env.CMC_API_KEY ?? process.env.COINMARKETCAP_API_KEY ?? '').trim(),
    slug: (process.env.CMC_SLUG ?? '').trim(),
    id: (process.env.CMC_ID ?? '').trim(),
  };
}

export function resetCmcCache(): void {
  cached = null;
  inflight = null;
}

export async function fetchCmcQuote(fetchFn: FetchLike = fetch): Promise<CmcQuote | null> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return cached.quote;
  }
  if (inflight) return inflight;
  inflight = loadQuote(fetchFn)
    .then((quote) => {
      cached = { at: Date.now(), quote };
      return quote;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function parseCmcDetail(body: unknown, expectedSymbol = EXPECTED_SYMBOL): CmcQuote | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const symbol = typeof data.symbol === 'string' ? data.symbol : '';
  if (symbol.toUpperCase() !== expectedSymbol.toUpperCase()) {
    return null;
  }
  const stats = (data.statistics ?? {}) as Record<string, unknown>;
  const slug = typeof data.slug === 'string' ? data.slug : symbol.toLowerCase();
  return {
    id: num(data.id) ?? 0,
    name: typeof data.name === 'string' ? data.name : 'Sphere',
    symbol: symbol.toUpperCase(),
    slug,
    rank: num(stats.rank ?? data.cmcRank ?? data.cmc_rank),
    price: num(stats.price),
    marketCap: num(stats.marketCap),
    fullyDilutedMarketCap: num(stats.fullyDilutedMarketCap),
    volume24h: num(stats.volume24h ?? data.volume),
    percentChange1h: num(stats.priceChangePercentage1h),
    percentChange24h: num(stats.priceChangePercentage24h),
    percentChange7d: num(stats.priceChangePercentage7d),
    circulatingSupply: num(stats.circulatingSupply ?? data.circulatingSupply),
    totalSupply: num(stats.totalSupply ?? data.totalSupply),
    maxSupply: num(stats.maxSupply ?? data.maxSupply),
    marketPairs: num(data.marketPairCount),
    lastUpdated: typeof data.latestUpdateTime === 'string' ? data.latestUpdateTime : null,
    url: `https://coinmarketcap.com/currencies/${slug}/`,
  };
}

export function parseCmcProQuotes(
  body: unknown,
  expectedSymbol = EXPECTED_SYMBOL,
): CmcQuote | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const data = root.data;
  if (!data || typeof data !== 'object') return null;

  let asset: Record<string, unknown> | undefined;
  if (Array.isArray(data)) {
    asset = data.find(
      (item) =>
        item &&
        typeof item === 'object' &&
        String((item as Record<string, unknown>).symbol).toUpperCase() === expectedSymbol,
    ) as Record<string, unknown> | undefined;
  } else {
    const map = data as Record<string, unknown>;
    const direct = map[expectedSymbol] ?? map[expectedSymbol.toLowerCase()];
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      asset = direct as Record<string, unknown>;
    } else {
      asset = Object.values(map).find(
        (item) =>
          item &&
          typeof item === 'object' &&
          String((item as Record<string, unknown>).symbol).toUpperCase() === expectedSymbol,
      ) as Record<string, unknown> | undefined;
    }
  }
  if (!asset) return null;

  const usd = extractUsdQuote(asset.quote);
  if (!usd) return null;
  const slug = typeof asset.slug === 'string' ? asset.slug : expectedSymbol.toLowerCase();
  return {
    id: num(asset.id) ?? 0,
    name: typeof asset.name === 'string' ? asset.name : 'Sphere',
    symbol: expectedSymbol,
    slug,
    rank: num(asset.cmc_rank ?? asset.cmcRank),
    price: num(usd.price),
    marketCap: num(usd.market_cap),
    fullyDilutedMarketCap: num(usd.fully_diluted_market_cap),
    volume24h: num(usd.volume_24h),
    percentChange1h: num(usd.percent_change_1h),
    percentChange24h: num(usd.percent_change_24h),
    percentChange7d: num(usd.percent_change_7d),
    circulatingSupply: num(asset.circulating_supply),
    totalSupply: num(asset.total_supply),
    maxSupply: num(asset.max_supply),
    marketPairs: num(asset.num_market_pairs),
    lastUpdated: typeof usd.last_updated === 'string' ? usd.last_updated : null,
    url: `https://coinmarketcap.com/currencies/${slug}/`,
  };
}

async function loadQuote(fetchFn: FetchLike): Promise<CmcQuote | null> {
  const { apiKey, slug, id } = cmcConfig();
  try {
    if (apiKey) {
      const params = id ? `id=${encodeURIComponent(id)}` : `symbol=${EXPECTED_SYMBOL}`;
      const body = await getJson(`${CMC_PRO_QUOTES}?${params}&convert=USD`, fetchFn, {
        'X-CMC_PRO_API_KEY': apiKey,
      });
      return parseCmcProQuotes(body);
    }
    if (slug) {
      const body = await getJson(`${CMC_PUBLIC_DETAIL}?slug=${encodeURIComponent(slug)}`, fetchFn);
      return parseCmcDetail(body);
    }
  } catch {
    return null;
  }
  return null;
}

async function getJson(
  url: string,
  fetchFn: FetchLike,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SphereNode/1.0',
        ...extraHeaders,
      },
    });
    if (!response.ok) {
      throw new Error(`CMC HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractUsdQuote(quote: unknown): Record<string, unknown> | null {
  if (!quote) return null;
  if (Array.isArray(quote)) {
    const usd = quote.find(
      (item) =>
        item && typeof item === 'object' && (item as Record<string, unknown>).symbol === 'USD',
    );
    return usd && typeof usd === 'object' ? (usd as Record<string, unknown>) : null;
  }
  if (typeof quote === 'object' && quote && 'USD' in quote) {
    const usd = (quote as Record<string, unknown>).USD;
    return usd && typeof usd === 'object' ? (usd as Record<string, unknown>) : null;
  }
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
