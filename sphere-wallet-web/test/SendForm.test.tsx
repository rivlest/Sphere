import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SendForm } from '../src/components/SendForm';
import { createWallet } from '../src/lib/crypto';
import { ORBS_PER_SPH } from '../src/types';
import { renderWithProviders } from './render';

const sender = createWallet();
const recipient = createWallet();

function jsonResponse(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: async () => data,
  });
}

describe('SendForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signs locally and posts a transaction without the private key', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/balance/')) {
        return jsonResponse({
          address: sender.address,
          balance: 10 * ORBS_PER_SPH,
          balanceSph: '10',
          nonce: 0,
          nextNonce: 1,
        });
      }
      if (url.includes('/transactions') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { hash: string };
        return jsonResponse({ accepted: true, hash: body.hash }, true);
      }
      return jsonResponse({ error: 'unexpected' }, false);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<SendForm />, { session: sender, route: '/send' });

    await user.type(screen.getByLabelText('Adres odbiorcy'), recipient.address);
    await user.clear(screen.getByLabelText('Kwota (SPH)'));
    await user.type(screen.getByLabelText('Kwota (SPH)'), '1.25');

    await user.click(screen.getByRole('button', { name: 'Dalej' }));
    await screen.findByText('Potwierdź wysyłkę');
    await user.click(screen.getByRole('button', { name: 'Potwierdź i wyślij' }));

    await screen.findByText('Transakcja przyjęta');

    const post = fetchMock.mock.calls.find(
      ([, init]) => init && typeof init === 'object' && 'method' in init && init.method === 'POST',
    );
    expect(post).toBeTruthy();
    const serialized = JSON.stringify(post?.[1]);
    expect(serialized).not.toContain(sender.privateKey);
    const body = JSON.parse(String((post?.[1] as RequestInit).body)) as {
      from: string;
      to: string;
      signature: string;
      hash: string;
      amount: number;
    };
    expect(body.from).toBe(sender.address);
    expect(body.to).toBe(recipient.address);
    expect(body.amount).toBe(125_000_000);
    expect(body.signature).toHaveLength(130);
    expect(body.hash).toHaveLength(64);
  });
});
