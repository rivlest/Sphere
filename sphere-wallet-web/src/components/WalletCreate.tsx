import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { createWallet } from '../lib/crypto';
import { encryptKeystore } from '../lib/keystore';
import type { WalletSession } from '../types';
import { encodeDisplayAddress } from '../lib/address';
import { CopyButton } from './CopyButton';

export function WalletCreate() {
  const { unlock } = useWallet();
  const navigate = useNavigate();
  const [session, setSession] = useState<WalletSession | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [password, setPassword] = useState('');
  const [keystoreError, setKeystoreError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(true);

  function onGenerate() {
    const wallet = createWallet();
    setSession(wallet);
    unlock(wallet);
    setAcknowledged(false);
  }

  async function onDownloadKeystore() {
    if (!session) return;
    setKeystoreError(null);
    try {
      const file = await encryptKeystore(session.privateKey, session.address, password);
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sphere-${session.address.slice(0, 12)}.keystore.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setKeystoreError(error instanceof Error ? error.message : 'Nie udało się zaszyfrować keystore');
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Nowy portfel</h1>
      {!session ? (
        <>
          <Warning />
          <button type="button" className="btn-primary w-full py-3" onClick={onGenerate}>
            Stwórz nowy portfel
          </button>
          <Link to="/" className="btn-secondary w-full">
            Wróć
          </Link>
        </>
      ) : (
        <>
          <Warning />
          <div className="card space-y-3">
            <p className="label">Adres</p>
            <p className="break-all font-mono text-sm">{encodeDisplayAddress(session.address)}</p>
            <CopyButton text={encodeDisplayAddress(session.address)} label="Kopiuj adres" />
            <p className="text-xs text-mute">On-chain: {session.address}</p>
          </div>
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <p className="label mb-0">Klucz prywatny</p>
              <button type="button" className="text-xs text-orb" onClick={() => setRevealed((v) => !v)}>
                {revealed ? 'Ukryj' : 'Pokaż'}
              </button>
            </div>
            <p className="break-all font-mono text-sm">
              {revealed ? session.privateKey : '•'.repeat(64)}
            </p>
            <CopyButton text={session.privateKey} label="Kopiuj klucz prywatny" />
          </div>
          <div className="card space-y-3">
            <p className="label">Pobierz jako zaszyfrowany keystore</p>
            <input
              type="password"
              className="field"
              placeholder="Hasło (min. 8 znaków)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            {keystoreError && <p className="text-sm text-danger">{keystoreError}</p>}
            <button type="button" className="btn-secondary w-full" onClick={onDownloadKeystore}>
              Pobierz jako zaszyfrowany keystore
            </button>
          </div>
          <label className="flex items-start gap-3 text-sm text-mute">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            Zapisałem klucz prywatny w bezpiecznym miejscu. Rozumiem, że nikt nie może go odzyskać.
          </label>
          <button
            type="button"
            className="btn-primary w-full py-3"
            disabled={!acknowledged}
            onClick={() => navigate('/dashboard')}
          >
            Przejdź do panelu
          </button>
        </>
      )}
    </div>
  );
}

function Warning() {
  return (
    <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm leading-relaxed text-warn">
      Zapisz klucz prywatny w bezpiecznym miejscu. Nikt nie może go odzyskać. Nigdy nikomu go nie
      udostępniaj. Po odświeżeniu strony zniknie z pamięci, jeśli nie pobierzesz keystore.
    </div>
  );
}
