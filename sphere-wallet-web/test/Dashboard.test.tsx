import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../src/components/Dashboard';
import { createWallet } from '../src/lib/crypto';
import { renderWithProviders } from './render';

const session = createWallet();

function jsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

describe('Dashboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the address and converted SPH balance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/balance/')) {
          return jsonResponse({
            address: session.address,
            balance: 250_000_000,
            balanceSph: '2.5',
            nonce: 2,
            nextNonce: 3,
          });
        }
        if (url.includes('/status')) {
          return jsonResponse({
            name: 'Sphere',
            symbol: 'SPH',
            height: 4,
            difficulty: 3,
            peers: 0,
            mining: false,
            mempool: 0,
            latestHash: 'ab',
          });
        }
        if (url.includes('/price')) {
          return jsonResponse({
            demo: true,
            source: 'simulated',
            label: 'Simulated price (demo)',
            currency: 'USD',
            price: 0.0123,
            change1hPercent: 1.5,
            updatedAt: Date.now(),
            intervalMs: 3000,
            history: [
              { timestamp: Date.now() - 3000, price: 0.01 },
              { timestamp: Date.now(), price: 0.0123 },
            ],
          });
        }
        if (url.includes('/transactions/')) {
          return jsonResponse({ transactions: [] });
        }
        return jsonResponse({});
      }),
    );

    renderWithProviders(<Dashboard />, { session, route: '/dashboard' });

    expect(await screen.findByText(/Kurs symulowany \(demo\)/)).toBeInTheDocument();
    expect(await screen.findByText('2.5 SPH')).toBeInTheDocument();
    expect(screen.getByText(/250000000 Orbów/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wyślij' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Odbierz' })).toBeInTheDocument();
  });
});
