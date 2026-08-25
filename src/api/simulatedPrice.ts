/**
 * DEMO ONLY. Sphere has no public market, so this feed is a bounded random walk.
 * Swap `snapshot()` for a real exchange client when SPH is listed.
 */

export const PRICE_START_USD = 0.01;
export const PRICE_MIN_USD = 0.0001;
export const PRICE_TICK_MS = 3_000;
export const PRICE_HISTORY_MS = 60 * 60 * 1000;
export const PRICE_CHART_POINTS = 120;

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface SimulatedPriceSnapshot {
  demo: true;
  source: 'simulated';
  label: 'Simulated price (demo)';
  currency: 'USD';
  price: number;
  change1hPercent: number;
  updatedAt: number;
  intervalMs: number;
  history: PricePoint[];
}

function stepPrice(price: number): number {
  const shock = (Math.random() - 0.5) * 2 * 0.025;
  return Math.max(PRICE_MIN_USD, price * (1 + shock));
}

export class SimulatedPriceFeed {
  private price: number;
  private lastTick: number;
  private history: PricePoint[];

  constructor(now = Date.now()) {
    this.history = seedHistory(now);
    this.price = this.history[this.history.length - 1]!.price;
    this.lastTick = now;
  }

  snapshot(now = Date.now()): SimulatedPriceSnapshot {
    this.advance(now);
    const hourAgo = now - PRICE_HISTORY_MS;
    const baseline = this.history.find((point) => point.timestamp >= hourAgo) ?? this.history[0]!;
    const change1hPercent =
      baseline.price === 0 ? 0 : ((this.price - baseline.price) / baseline.price) * 100;
    return {
      demo: true,
      source: 'simulated',
      label: 'Simulated price (demo)',
      currency: 'USD',
      price: this.price,
      change1hPercent,
      updatedAt: this.lastTick,
      intervalMs: PRICE_TICK_MS,
      history: this.history.slice(-PRICE_CHART_POINTS),
    };
  }

  private advance(now: number): void {
    while (now - this.lastTick >= PRICE_TICK_MS) {
      this.lastTick += PRICE_TICK_MS;
      this.price = stepPrice(this.price);
      this.history.push({ timestamp: this.lastTick, price: this.price });
      const cutoff = this.lastTick - PRICE_HISTORY_MS;
      while (this.history.length > 0 && this.history[0]!.timestamp < cutoff) {
        this.history.shift();
      }
    }
  }
}

function seedHistory(now: number): PricePoint[] {
  const points: PricePoint[] = [];
  let price = PRICE_START_USD;
  const start = now - PRICE_HISTORY_MS;
  for (let timestamp = start; timestamp <= now; timestamp += PRICE_TICK_MS) {
    price = stepPrice(price);
    points.push({ timestamp, price });
  }
  return points;
}

export const simulatedPrice = new SimulatedPriceFeed();
