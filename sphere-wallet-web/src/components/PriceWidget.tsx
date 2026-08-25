import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getPrice } from '../lib/api';
import type { PriceResponse } from '../types';

export function PriceWidget() {
  const [data, setData] = useState<PriceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await getPrice();
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Brak kursu');
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const change = data?.change1hPercent ?? 0;
  const up = change >= 0;

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="label mb-0">Kurs SPH / USD</p>
          <p className="mt-2 text-2xl font-semibold">
            {data ? `$${data.price.toFixed(4)}` : '…'}
          </p>
        </div>
        <span className="rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-warn">
          Kurs symulowany (demo)
        </span>
      </div>
      <p className="mb-3 text-xs text-mute">
        Sphere nie ma publicznego rynku — to losowy spacer startujący od $0.01, nie dane giełdowe.
        {data && (
          <span className={up ? 'ml-1 text-orb' : 'ml-1 text-danger'}>
            {`${up ? '+' : ''}${change.toFixed(2)}% (1h)`}
          </span>
        )}
      </p>
      <div className="h-24 min-w-0">
        {data && data.history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.history}>
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
          <div className="flex h-full items-center text-xs text-mute">
            {error ?? 'Ładowanie wykresu…'}
          </div>
        )}
      </div>
    </div>
  );
}
