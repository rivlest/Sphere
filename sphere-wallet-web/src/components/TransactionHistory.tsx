import { useEffect, useState } from 'react';
import { getAddressTransactions } from '../lib/api';
import { formatOrbsToSph, shortenAddress } from '../lib/units';
import { COINBASE_SENDER, type AddressTransaction } from '../types';

export function TransactionHistory({ address }: { address: string }) {
  const [items, setItems] = useState<AddressTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAddressTransactions(address)
      .then((txs) => {
        if (!cancelled) setItems(txs);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Brak historii');
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <div className="card">
      <p className="label">Ostatnie transakcje</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && items.length === 0 && (
        <p className="text-sm text-mute">Brak transakcji dla tego adresu.</p>
      )}
      <ul className="divide-y divide-white/5">
        {items.map((tx) => {
          const incoming = tx.to === address && tx.from !== address;
          const counterparty = incoming
            ? tx.from === COINBASE_SENDER
              ? 'coinbase'
              : tx.from
            : tx.to;
          return (
            <li key={tx.hash} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0 text-left">
                <p className="truncate font-mono text-xs text-mute" title={counterparty}>
                  {counterparty === 'coinbase' ? 'Coinbase' : shortenAddress(counterparty, 6)}
                </p>
                <p className="text-[11px] text-mute">
                  {new Date(tx.timestamp).toLocaleString('pl-PL')} ·{' '}
                  {tx.status === 'pending' ? 'oczekująca' : `blok ${tx.blockHeight ?? '—'}`}
                </p>
              </div>
              <p className={incoming ? 'font-medium text-orb' : 'font-medium'}>
                {incoming ? '+' : '−'}
                {formatOrbsToSph(tx.amount)} SPH
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
