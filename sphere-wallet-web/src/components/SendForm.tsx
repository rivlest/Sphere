import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { ApiError, getBalance, submitTransaction } from '../lib/api';
import { mapNodeError, SEND_ERROR_COPY, validateSendForm } from '../lib/sendValidation';
import { formatOrbsToSph } from '../lib/units';
import { DEFAULT_FEE_SPH } from '../types';

type Phase = 'form' | 'confirm' | 'sending' | 'success' | 'error';

export function SendForm() {
  const { wallet, signTransaction } = useWallet();
  const navigate = useNavigate();
  const sender = wallet!.address;
  const [to, setTo] = useState('');
  const [amountSph, setAmountSph] = useState('');
  const [feeSph, setFeeSph] = useState(DEFAULT_FEE_SPH);
  const [balanceOrbs, setBalanceOrbs] = useState(0);
  const [phase, setPhase] = useState<Phase>('form');
  const [nonce, setNonce] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState(() =>
    validateSendForm({ to: '', amountSph: '', feeSph: DEFAULT_FEE_SPH, sender, balanceOrbs: 0 }),
  );
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    void getBalance(sender).then((account) => setBalanceOrbs(account.balance));
  }, [sender]);

  useEffect(() => {
    setValidation(validateSendForm({ to, amountSph, feeSph, sender, balanceOrbs }));
  }, [to, amountSph, feeSph, sender, balanceOrbs]);

  async function onPrepare(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    const next = validateSendForm({ to, amountSph, feeSph, sender, balanceOrbs });
    setValidation(next);
    if (!next.valid) return;
    try {
      const account = await getBalance(sender);
      setBalanceOrbs(account.balance);
      const checked = validateSendForm({
        to,
        amountSph,
        feeSph,
        sender,
        balanceOrbs: account.balance,
      });
      setValidation(checked);
      if (!checked.valid) return;
      setNonce(account.nextNonce);
      setPhase('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać nonce');
      setPhase('error');
    }
  }

  async function onConfirm() {
    setPhase('sending');
    setError(null);
    try {
      const account = await getBalance(sender);
      const checked = validateSendForm({
        to,
        amountSph,
        feeSph,
        sender,
        balanceOrbs: account.balance,
      });
      if (!checked.valid) {
        setValidation(checked);
        setPhase('form');
        return;
      }
      const tx = signTransaction({
        to: to.trim().toLowerCase(),
        amount: checked.amountOrbs,
        fee: checked.feeOrbs,
        nonce: account.nextNonce,
      });
      const result = await submitTransaction(tx);
      setTxHash(result.hash);
      setPhase('success');
    } catch (err) {
      const message = err instanceof ApiError || err instanceof Error ? err.message : 'Broadcast failed';
      setError(mapNodeError(message));
      setPhase('error');
    }
  }

  if (phase === 'success') {
    return (
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold text-orb">Transakcja przyjęta</h1>
        <p className="break-all font-mono text-sm text-mute">{txHash}</p>
        <button type="button" className="btn-primary w-full" onClick={() => navigate('/dashboard')}>
          Do panelu
        </button>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold text-danger">Nie udało się wysłać</h1>
        <p className="text-sm">{error}</p>
        <button type="button" className="btn-primary w-full" onClick={() => setPhase('form')}>
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  if (phase === 'confirm' || phase === 'sending') {
    return (
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold">Potwierdź wysyłkę</h1>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-mute">Kwota</dt>
            <dd className="font-medium">{formatOrbsToSph(validation.amountOrbs)} SPH</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mute">Odbiorca</dt>
            <dd className="break-all text-right font-mono text-xs">{to.trim().toLowerCase()}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mute">Opłata</dt>
            <dd>{formatOrbsToSph(validation.feeOrbs)} SPH</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-white/10 pt-2">
            <dt className="text-mute">Razem</dt>
            <dd className="font-semibold">
              {formatOrbsToSph(validation.amountOrbs + validation.feeOrbs)} SPH
            </dd>
          </div>
          {nonce !== null && (
            <div className="flex justify-between gap-4">
              <dt className="text-mute">Nonce</dt>
              <dd className="font-mono">{nonce}</dd>
            </div>
          )}
        </dl>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn-secondary" onClick={() => setPhase('form')} disabled={phase === 'sending'}>
            Anuluj
          </button>
          <button type="button" className="btn-primary" onClick={() => void onConfirm()} disabled={phase === 'sending'}>
            {phase === 'sending' ? 'Wysyłanie…' : 'Potwierdź i wyślij'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={(e) => void onPrepare(e)}>
      <h1 className="text-2xl font-semibold">Wyślij SPH</h1>
      <p className="text-sm text-mute">Saldo: {formatOrbsToSph(balanceOrbs)} SPH</p>
      <div>
        <label className="label" htmlFor="to">
          Adres odbiorcy
        </label>
        <input
          id="to"
          className="field"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="sph1…"
          autoComplete="off"
          spellCheck={false}
        />
        {attempted && validation.to && (
          <p className="mt-1 text-xs text-danger">{SEND_ERROR_COPY[validation.to]}</p>
        )}
        {validation.selfTransfer && (
          <p className="mt-1 text-xs text-warn">Adres odbiorcy jest taki sam jak Twój — to transfer do siebie.</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="amount">
          Kwota (SPH)
        </label>
        <input
          id="amount"
          className="field"
          value={amountSph}
          onChange={(e) => setAmountSph(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />
        {attempted && validation.amount && (
          <p className="mt-1 text-xs text-danger">{SEND_ERROR_COPY[validation.amount]}</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="fee">
          Opłata (SPH)
        </label>
        <input
          id="fee"
          className="field"
          value={feeSph}
          onChange={(e) => setFeeSph(e.target.value)}
          inputMode="decimal"
        />
        <p className="mt-1 text-xs text-mute">Sugerowana opłata domyślna: {DEFAULT_FEE_SPH} SPH</p>
        {attempted && validation.fee && (
          <p className="mt-1 text-xs text-danger">{SEND_ERROR_COPY[validation.fee]}</p>
        )}
      </div>
      <button type="submit" className="btn-primary w-full py-3">
        Dalej
      </button>
      <Link to="/dashboard" className="btn-secondary w-full">
        Anuluj
      </Link>
    </form>
  );
}
