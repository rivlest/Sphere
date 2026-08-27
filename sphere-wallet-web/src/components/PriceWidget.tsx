import { useEffect, useState, type ReactNode } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getMarket } from '../lib/api';
import { formatCompact, formatPct, formatPrice, formatUsd } from '../lib/format';
import type { MarketSnapshot } from '../types';
import { OrbMark } from './OrbMark';

function ChangeChip({ label, value }: { label: string; value: number | null }) {
  const text = formatPct(value);
  if (!text) {
    return (
      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-mute">
        {label} —
      </span>
    );
  }
  const up = (value ?? 0) >= 0;
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        up ? 'bg-orb/15 text-orb' : 'bg-danger/15 text-danger'
      }`}
    >
      {label} {text}
    </span>
  );
}

function StatRow({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-white/5 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-mute">{label}</p>
          {hint && <p className="mt-0.5 text-[10px] text-mute/80">{hint}</p>}
        </div>
        <p className="text-right text-sm font-semibold tracking-tight">{value}</p>
      </div>
      {children}
    </div>
  );
}

function formatSupplyPct(pct: number): string {
  if (pct <= 0) return '0%';
  if (pct < 0.01) return `${pct.toFixed(4)}%`;
  return `${pct.toFixed(2)}%`;
}

function holdersLabel(count: number): string {
  if (count === 1) return '1 adres';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} adresy`;
  return `${count} adresów`;
}

export function PriceWidget() {
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function load() {
      try {
        const next = await getMarket();
        if (cancelled) return;
        setData(next);
        setError(null);
        timer = window.setTimeout(() => void load(), Math.max(8_000, next.pollIntervalMs || 15_000));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Brak danych rynkowych');
        timer = window.setTimeout(() => void load(), 15_000);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const supplyPct =
    data && data.maxSupply > 0 ? Math.min(100, (data.circulatingSupply / data.maxSupply) * 100) : 0;

  return (
    <div className="card space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrbMark className="h-11 w-11" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold leading-tight">Sphere</p>
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-mute">
                SPH
              </span>
              <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-mute">
                {data?.rank ? `#${data.rank}` : 'nienotowany'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-mute">Dane jak na CoinMarketCap</p>
          </div>
        </div>
        <a
          href={data?.cmcUrl ?? 'https://coinmarketcap.com/'}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-mute hover:border-orb/40 hover:text-orb"
        >
          CoinMarketCap ↗
        </a>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Cena SPH</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">{formatPrice(data?.price ?? null)}</p>
        <p className="mt-0.5 text-xs text-mute">USD</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <ChangeChip label="1h" value={data?.change1hPercent ?? null} />
          <ChangeChip label="24h" value={data?.change24hPercent ?? null} />
          <ChangeChip label="7d" value={data?.change7dPercent ?? null} />
        </div>
      </div>

      <div className="h-24 min-w-0 overflow-hidden rounded-xl border border-white/5 bg-night/50">
        {data && data.history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.history} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <XAxis dataKey="timestamp" hide />
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Tooltip
                contentStyle={{ background: '#10182a', border: '1px solid rgba(255,255,255,0.1)' }}
                formatter={(value) => [`$${Number(value).toFixed(5)}`, 'USD']}
                labelFormatter={(label) =>
                  typeof label === 'number' ? new Date(label).toLocaleTimeString() : ''
                }
              />
              <Line type="monotone" dataKey="price" stroke="#5eead4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center px-4 text-xs leading-relaxed text-mute">
            {error ??
              (data?.listed
                ? 'Wykres pojawi się po kolejnych notowaniach.'
                : 'Kurs i wolumen z CMC po listingu SPH. Kapitalizacja i podaż są z łańcucha.')}
          </div>
        )}
      </div>

      <div>
        <StatRow label="Kapitalizacja" value={formatUsd(data?.marketCap)} hint="cena × supply" />
        <StatRow label="FDV" value={formatUsd(data?.fullyDilutedMarketCap)} hint="cena × max" />
        <StatRow label="Wolumen 24h" value={formatUsd(data?.volume24h)} />
        <StatRow
          label="Ranking"
          value={data?.rank ? `#${data.rank}` : '—'}
          hint={data?.listed ? 'CoinMarketCap' : 'brak na CMC'}
        />
        <StatRow
          label="Podaż w obiegu"
          value={data ? `${formatCompact(data.circulatingSupply)} SPH` : '—'}
          hint={data ? holdersLabel(data.holders) : undefined}
        >
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-mute">
              <span>
                {data
                  ? `${formatCompact(data.circulatingSupply)} / ${formatCompact(data.maxSupply)} SPH`
                  : '—'}
              </span>
              <span>{data ? formatSupplyPct(supplyPct) : '—'}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orb to-ring"
                style={{ width: `${supplyPct}%` }}
              />
            </div>
          </div>
        </StatRow>
        <StatRow label="Max. podaż" value={data ? `${formatCompact(data.maxSupply)} SPH` : '—'} />
      </div>

      {data && (
        <p className="text-[11px] leading-relaxed text-mute">
          {data.listed
            ? 'Notowania z CoinMarketCap, podaż z węzła Sphere. Strona CMC sphere to SPHR — inny token.'
            : 'SPH nie ma jeszcze listingu na CoinMarketCap (slug sphere to SPHR). Kapitalizacja pojawi się, gdy będzie kurs.'}
        </p>
      )}
    </div>
  );
}
