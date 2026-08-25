import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createSignedTransaction } from '../lib/crypto';
import type { Transaction, WalletSession } from '../types';

interface WalletContextValue {
  wallet: WalletSession | null;
  unlock: (session: WalletSession) => void;
  lock: () => void;
  signTransaction: (params: {
    to: string;
    amount: number;
    fee: number;
    nonce: number;
    timestamp?: number;
  }) => Transaction;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({
  children,
  initialWallet = null,
}: {
  children: ReactNode;
  initialWallet?: WalletSession | null;
}) {
  const [wallet, setWallet] = useState<WalletSession | null>(initialWallet);

  const unlock = useCallback((session: WalletSession) => {
    setWallet(session);
  }, []);

  const lock = useCallback(() => {
    setWallet(null);
  }, []);

  const signTransaction = useCallback(
    (params: {
      to: string;
      amount: number;
      fee: number;
      nonce: number;
      timestamp?: number;
    }): Transaction => {
      if (!wallet) {
        throw new Error('Wallet is locked');
      }
      return createSignedTransaction({ ...params, from: wallet.address }, wallet.privateKey);
    },
    [wallet],
  );

  const value = useMemo(
    () => ({ wallet, unlock, lock, signTransaction }),
    [wallet, unlock, lock, signTransaction],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return ctx;
}
