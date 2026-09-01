import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { encodeDisplayAddress } from '../lib/address';
import { CopyButton } from './CopyButton';

export function ReceiveView() {
  const { wallet } = useWallet();
  const address = encodeDisplayAddress(wallet!.address);
  const [amount, setAmount] = useState('');

  const paymentUri = useMemo(() => {
    const trimmed = amount.trim().replace(',', '.');
    if (!trimmed) return address;
    return `sphere:${address}/?amount=${encodeURIComponent(trimmed)}`;
  }, [address, amount]);

  return (
    <div className="mx-auto max-w-md space-y-5 text-center">
      <h1 className="text-2xl font-semibold">Odbierz SPH</h1>
      <div className="card flex flex-col items-center gap-4">
        <div className="rounded-2xl bg-white p-3">
          <QRCodeSVG value={paymentUri} size={220} includeMargin level="M" />
        </div>
        <p className="break-all font-mono text-sm leading-relaxed">{address}</p>
        <CopyButton text={address} label="Kopiuj adres" className="btn-primary w-full" />
      </div>
      <div className="card text-left">
        <label className="label" htmlFor="request-amount">
          Link żądania płatności (opcjonalnie)
        </label>
        <input
          id="request-amount"
          className="field"
          placeholder="kwota SPH, np. 5"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
        />
        <p className="mt-3 break-all font-mono text-xs text-mute">{paymentUri}</p>
        <div className="mt-3">
          <CopyButton text={paymentUri} label="Kopiuj link" />
        </div>
      </div>
      <Link to="/dashboard" className="btn-secondary w-full">
        Wróć
      </Link>
    </div>
  );
}
