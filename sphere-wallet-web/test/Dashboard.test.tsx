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
            utxos: [],
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
        if (url.includes('/market')) {
          return jsonResponse({
            name: 'Sphere',
            symbol: 'SPH',
            listed: false,
            source: 'onchain',
            cmcUrl: 'https://coinmarketcap.com/',
            available: true,
            currency: 'USD',
            price: 0.0123,
            change1hPercent: 1.5,
            change24hPercent: null,
            change7dPercent: null,
            marketCap: 615_000,
            fullyDilutedMarketCap: 258_300,
            volume24h: null,
            rank: null,
            marketPairs: null,
            circulatingSupply: 50,
            circulatingSupplyLabel: '50',
            totalSupply: 50,
            maxSupply: 21_000_000,
            maxSupplyLabel: '21000000',
            holders: 1,
            height: 0,
            history: [
              { timestamp: Date.now() - 3000, price: 0.01 },
              { timestamp: Date.now(), price: 0.0123 },
            ],
            updatedAt: Date.now(),
            pollIntervalMs: 15_000,
          });
        }
        if (url.includes('/price')) {
          return jsonResponse({
            available: true,
            source: 'exchange.example',
            currency: 'USD',
            price: 0.0123,
            change1hPercent: 1.5,
            updatedAt: Date.now(),
            pollIntervalMs: 15_000,
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

    expect(await screen.findByText('2.5 SPH')).toBeInTheDocument();
    expect(await screen.findByText('$0.0123')).toBeInTheDocument();
    expect(screen.getByText('Kapitalizacja')).toBeInTheDocument();
    expect(screen.getByText('Podaż w obiegu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CoinMarketCap/ })).toBeInTheDocument();
    expect(screen.queryByText(/symulowany/i)).not.toBeInTheDocument();
    expect(screen.getByText(/250000000 Orbów/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wyślij' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Odbierz' })).toBeInTheDocument();
  });
});
