import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { walletFromPrivateKey } from '../lib/crypto';
import { decryptKeystore, parseKeystoreJson } from '../lib/keystore';

export function WalletImport() {
  const { unlock } = useWallet();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'key' | 'keystore'>('key');
  const [privateKey, setPrivateKey] = useState('');
  const [password, setPassword] = useState('');
  const [keystoreText, setKeystoreText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setFileName(file.name);
    setKeystoreText(await file.text());
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (mode === 'key') {
        unlock(walletFromPrivateKey(privateKey));
      } else {
        if (!keystoreText) {
          throw new Error('Wybierz plik keystore');
        }
        const file = parseKeystoreJson(keystoreText);
        const key = await decryptKeystore(file, password);
        unlock(walletFromPrivateKey(key));
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import nie powiódł się');
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Importuj portfel</h1>
      <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm leading-relaxed text-warn">
        Importuj tylko na zaufanym urządzeniu. Klucz prywatny zostanie w pamięci tej karty i zniknie
        po odświeżeniu. Nigdy nie wklejaj klucza na nieznanych stronach.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={mode === 'key' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setMode('key')}
        >
          Klucz prywatny
        </button>
        <button
          type="button"
          className={mode === 'keystore' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setMode('keystore')}
        >
          Plik keystore
        </button>
      </div>
      <form className="card space-y-4" onSubmit={onSubmit}>
        {mode === 'key' ? (
          <div>
            <label className="label" htmlFor="private-key">
              Klucz prywatny (hex)
            </label>
            <textarea
              id="private-key"
              className="field min-h-24 resize-y"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="wklej 64 znaki hex"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="keystore-file">
                Plik keystore
              </label>
              <input
                id="keystore-file"
                type="file"
                accept="application/json,.json"
                className="block w-full text-sm text-mute file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-ink"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                }}
              />
              {fileName && <p className="mt-2 text-xs text-mute">{fileName}</p>}
            </div>
            <div>
              <label className="label" htmlFor="keystore-password">
                Hasło
              </label>
              <input
                id="keystore-password"
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className="btn-primary w-full py-3">
          Importuj portfel
        </button>
      </form>
      <Link to="/" className="btn-secondary w-full">
        Wróć
      </Link>
    </div>
  );
}
