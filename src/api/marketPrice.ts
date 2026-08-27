/**
 * Live SPH/USD quotes from an external market API.
 * Never invents prices — no random walk, no demo ticks.
 *
 * Set SPHERE_PRICE_URL to a JSON endpoint. Accepted shapes:
 *   { "price": 0.05, "history"?: [{ "timestamp": 0, "price": 0.05 }] }
 *   CoinGecko simple/price: { "sphere": { "usd": 0.05 } }
 */

export const PRICE_HISTORY_MS = 60 * 60 * 1000;
export const PRICE_MAX_POINTS = 240;
export const PRICE_POLL_MS = 15_000;
export const PRICE_FETCH_TIMEOUT_MS = 8_000;

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface MarketPriceQuote {
  available: boolean;
  source: string | null;
  currency: 'USD';
  price: number | null;
  change1hPercent: number | null;
  updatedAt: number | null;
  pollIntervalMs: number;
  history: PricePoint[];
  error?: string;
}

export interface ParsedMarketPayload {
  price: number;
  history?: PricePoint[];
  change1hPercent?: number;
}

type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export function configuredPriceUrl(): string {
  return (process.env.SPHERE_PRICE_URL ?? '').trim();
}

export function parseMarketPayload(body: unknown): ParsedMarketPayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid price payload');
  }
  const rec = body as Record<string, unknown>;

  if (typeof rec.price === 'number') {
    return {
      price: requirePositivePrice(rec.price),
      history: parseHistory(rec.history),
      change1hPercent: parseOptionalNumber(rec.change1hPercent),
    };
  }

  for (const value of Object.values(rec)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const usd = (value as Record<string, unknown>).usd;
    if (typeof usd === 'number') {
      return { price: requirePositivePrice(usd) };
    }
  }

  throw new Error('Market response did not contain a USD price');
}

export class MarketPriceService {
  private history: PricePoint[] = [];
  private lastFetchAt = 0;
  private lastQuote: MarketPriceQuote | null = null;
  private inflight: Promise<MarketPriceQuote> | null = null;

  constructor(
    private readonly options: {
      url?: string;
      fetchFn?: FetchLike;
      pollIntervalMs?: number;
    } = {},
  ) {}

  async getQuote(now = Date.now()): Promise<MarketPriceQuote> {
    const url = this.options.url ?? configuredPriceUrl();
    if (!url) {
      return unavailable(null, 'not_configured');
    }

    const poll = this.options.pollIntervalMs ?? PRICE_POLL_MS;
    if (this.lastQuote?.available && now - this.lastFetchAt < poll) {
      return this.lastQuote;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.refresh(url, now).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refresh(url: string, now: number): Promise<MarketPriceQuote> {
    try {
      const parsed = await fetchMarket(url, this.options.fetchFn ?? fetch);
      this.ingest(parsed, now);
      const quote = this.buildQuote(url, now, parsed);
      this.lastQuote = quote;
      this.lastFetchAt = now;
      return quote;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Market fetch failed';
      if (this.lastQuote?.available) {
        return { ...this.lastQuote, error: message };
      }
      return unavailable(sourceLabel(url), message);
    }
  }

  private ingest(parsed: ParsedMarketPayload, now: number): void {
    if (parsed.history && parsed.history.length > 0) {
      this.history = parsed.history.filter((point) => point.price > 0).slice(-PRICE_MAX_POINTS);
      return;
    }
    const last = this.history[this.history.length - 1];
    if (!last || last.price !== parsed.price || now - last.timestamp >= 1_000) {
      this.history.push({ timestamp: now, price: parsed.price });
    }
    const cutoff = now - PRICE_HISTORY_MS;
    while (this.history.length > 0 && this.history[0]!.timestamp < cutoff) {
      this.history.shift();
    }
    if (this.history.length > PRICE_MAX_POINTS) {
      this.history.splice(0, this.history.length - PRICE_MAX_POINTS);
    }
  }

  private buildQuote(url: string, now: number, parsed: ParsedMarketPayload): MarketPriceQuote {
    const hourAgo = now - PRICE_HISTORY_MS;
    const baseline = this.history.find((point) => point.timestamp >= hourAgo) ?? this.history[0];
    const changeFromHistory =
      baseline && baseline.price > 0 && this.history.length > 1
        ? ((parsed.price - baseline.price) / baseline.price) * 100
        : null;
    return {
      available: true,
      source: sourceLabel(url),
      currency: 'USD',
      price: parsed.price,
      change1hPercent: changeFromHistory ?? parsed.change1hPercent ?? null,
      updatedAt: now,
      pollIntervalMs: this.options.pollIntervalMs ?? PRICE_POLL_MS,
      history: [...this.history],
    };
  }
}

export const marketPrice = new MarketPriceService();

function unavailable(source: string | null, error: string): MarketPriceQuote {
  return {
    available: false,
    source,
    currency: 'USD',
    price: null,
    change1hPercent: null,
    updatedAt: null,
    pollIntervalMs: PRICE_POLL_MS,
    history: [],
    error,
  };
}

function requirePositivePrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Price must be a positive number');
  }
  return value;
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseHistory(value: unknown): PricePoint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points: PricePoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.timestamp === 'number' && typeof rec.price === 'number' && rec.price > 0) {
      points.push({ timestamp: rec.timestamp, price: rec.price });
    }
  }
  return points;
}

function sourceLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function fetchMarket(url: string, fetchFn: FetchLike): Promise<ParsedMarketPayload> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRICE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Market HTTP ${response.status}`);
    }
    return parseMarketPayload(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
