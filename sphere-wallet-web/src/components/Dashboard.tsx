import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { getBalance, getNodeUrl, getStatus } from '../lib/api';
import { encodeDisplayAddress } from '../lib/address';
import { formatOrbsToSph, shortenAddress } from '../lib/units';
import { ORBS_PER_SPH } from '../types';
import { CopyButton } from './CopyButton';
import { PriceWidget } from './PriceWidget';
import { TransactionHistory } from './TransactionHistory';

export function Dashboard() {
  const { wallet } = useWallet();
  const address = wallet!.address;
  const displayAddress = encodeDisplayAddress(address);
  const [expanded, setExpanded] = useState(false);
  const [balanceOrbs, setBalanceOrbs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [height, setHeight] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [account, status] = await Promise.all([getBalance(address), getStatus().catch(() => null)]);
      setBalanceOrbs(account.balance);
      if (status) setHeight(status.height);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać salda');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [address]);

  const sphFromOrbs = balanceOrbs === null ? null : balanceOrbs / ORBS_PER_SPH;

  return (
    <div className="space-y-5">
      <div className="card">
        <p className="label">Adres portfela</p>
        <button
          type="button"
          className="break-all text-left font-mono text-sm"
          title={displayAddress}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? displayAddress : shortenAddress(displayAddress)}
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={displayAddress} label="Kopiuj" />
        </div>
      </div>

      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label">Saldo</p>
            <p className="text-3xl font-semibold tracking-tight">
              {loading && balanceOrbs === null
                ? '…'
                : `${formatOrbsToSph(balanceOrbs ?? 0)} SPH`}
            </p>
            {sphFromOrbs !== null && (
              <p className="mt-1 text-xs text-mute">
                {balanceOrbs} Orbów · {formatOrbsToSph(balanceOrbs ?? 0)} SPH (÷ 100000000)
              </p>
            )}
          </div>
          <button type="button" className="btn-secondary text-xs" onClick={() => void refresh()}>
            Odśwież
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <p className="mt-3 text-xs text-mute">
          Węzeł: {getNodeUrl()}
          {height !== null ? ` · wysokość ${height}` : ''}
        </p>
      </div>

      <PriceWidget />

      <div className="grid grid-cols-2 gap-3">
        <Link to="/send" className="btn-primary py-3">
          Wyślij
        </Link>
        <Link to="/receive" className="btn-secondary py-3">
          Odbierz
        </Link>
      </div>

      <TransactionHistory address={address} />
    </div>
  );
}
