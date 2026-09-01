import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { OrbMark } from './OrbMark';
import { UpdateBanner } from './UpdateBanner';

function BrandMark() {
  return (
    <>
      <OrbMark />
      <div>
        <p className="text-lg font-semibold leading-tight tracking-wide">Sphere</p>
        <p className="text-xs uppercase tracking-[0.2em] text-mute">Portfel SPH</p>
      </div>
    </>
  );
}

export function Shell() {
  const { wallet, lock } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const authed = Boolean(wallet);

  function onLogout() {
    lock();
    navigate('/');
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6">
      <header className="mb-8 flex items-center justify-between gap-3">
        {authed && location.pathname !== '/dashboard' ? (
          <Link to="/dashboard" className="flex items-center gap-3">
            <BrandMark />
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <BrandMark />
          </div>
        )}
        {authed && location.pathname !== '/' && (
          <button type="button" className="btn-danger text-xs" onClick={onLogout}>
            Wyloguj
          </button>
        )}
      </header>
      <main className="flex-1">
        {authed && <UpdateBanner />}
        <Outlet />
      </main>
      <footer className="mt-12 border-t border-white/10 pt-4 text-center text-xs leading-relaxed text-mute">
        Projekt demonstracyjny. Przed użyciem z realnymi środkami portfel wymagałby profesjonalnego
        audytu bezpieczeństwa. Klucz prywatny nigdy nie opuszcza tej przeglądarki.
      </footer>
    </div>
  );
}
