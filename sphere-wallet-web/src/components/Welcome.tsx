import { Link } from 'react-router-dom';

export function Welcome() {
  return (
    <div className="mx-auto max-w-lg text-center">
      <p className="mb-3 text-sm uppercase tracking-[0.35em] text-orb">Sieć Sphere</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Twój portfel SPH</h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-mute">
        Klucze powstają wyłącznie w przeglądarce. Węzeł widzi tylko adresy i podpisane transakcje —
        nigdy klucz prywatny.
      </p>
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Link to="/create" className="btn-primary py-3">
          Stwórz nowy portfel
        </Link>
        <Link to="/import" className="btn-secondary py-3">
          Importuj portfel
        </Link>
      </div>
    </div>
  );
}
