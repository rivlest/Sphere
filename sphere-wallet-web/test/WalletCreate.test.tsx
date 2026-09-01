import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WalletCreate } from '../src/components/WalletCreate';
import { WalletProvider } from '../src/context/WalletContext';

describe('WalletCreate', () => {
  it('generates a sph1 address after clicking create', async () => {
    const user = userEvent.setup();
    render(
      <WalletProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <WalletCreate />
        </MemoryRouter>
      </WalletProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Stwórz nowy portfel' }));

    expect(await screen.findByText(/^sph1[1-9A-HJ-NP-Za-km-z]+$/)).toBeInTheDocument();
    expect(screen.getByText(/On-chain:/)).toHaveTextContent(/sph1[0-9a-f]{40}/);
    expect(screen.getByText(/Zapisz klucz prywatny/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kopiuj klucz prywatny' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pobierz jako zaszyfrowany keystore' })).toBeInTheDocument();
  });
});
