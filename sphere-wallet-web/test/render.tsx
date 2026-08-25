import { type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WalletProvider } from '../src/context/WalletContext';
import type { WalletSession } from '../src/types';

export function renderWithProviders(
  ui: ReactNode,
  options: { route?: string; session?: WalletSession | null } = {},
) {
  const { route = '/', session = null } = options;
  return render(
    <WalletProvider initialWallet={session}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>
    </WalletProvider>,
  );
}
