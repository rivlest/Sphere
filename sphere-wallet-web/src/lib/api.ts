import type {
  AddressTransaction,
  BalanceResponse,
  MarketSnapshot,
  NodeStatus,
  PriceResponse,
  Transaction,
} from '../types';
import { isValidAddress } from './crypto';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getNodeUrl(): string {
  const raw = import.meta.env.VITE_SPHERE_NODE_URL ?? 'http://127.0.0.1:3001';
  return raw.replace(/\/$/, '');
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getNodeUrl()}${path}`, init);
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body && typeof body.error === 'string'
        ? body.error
        : response.statusText;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export async function getStatus(): Promise<NodeStatus> {
  return requestJson<NodeStatus>('/status');
}

export async function getBalance(address: string): Promise<BalanceResponse> {
  return requestJson<BalanceResponse>(`/balance/${address}`);
}

/**
 * SPH/USD from the node, which proxies a real market URL (SPHERE_PRICE_URL).
 * Map a different exchange response here if the wallet should talk to it directly.
 */
export async function getPrice(): Promise<PriceResponse> {
  return requestJson<PriceResponse>('/price');
}

export async function getMarket(): Promise<MarketSnapshot> {
  return requestJson<MarketSnapshot>('/market');
}

export async function submitTransaction(tx: Transaction): Promise<{ accepted: boolean; hash: string }> {
  return requestJson<{ accepted: boolean; hash: string }>('/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tx),
  });
}

export async function getAddressTransactions(address: string): Promise<AddressTransaction[]> {
  try {
    const data = await requestJson<{ transactions: AddressTransaction[] }>(
      `/transactions/${address}`,
    );
    return data.transactions;
  } catch {
    // TEMPORARY / non-scalable: scan GET /blocks when GET /transactions/:address is unavailable.
    return transactionsFromBlocks(address);
  }
}

async function transactionsFromBlocks(address: string): Promise<AddressTransaction[]> {
  const data = await requestJson<{ blocks: Array<{ header: { index: number }; hash: string; transactions: Transaction[] }> }>(
    '/blocks?from=0&limit=100',
  );
  const found: AddressTransaction[] = [];
  for (const block of data.blocks) {
    for (const tx of block.transactions) {
      if (tx.to === address || tx.from === address || tx.outputs?.some((o) => o.address === address)) {
        found.push({
          ...tx,
          status: 'confirmed',
          blockHeight: block.header.index,
          blockHash: block.hash,
        });
      }
    }
  }
  return found.reverse();
}

export function isApiAddress(address: string): boolean {
  return isValidAddress(address);
}
