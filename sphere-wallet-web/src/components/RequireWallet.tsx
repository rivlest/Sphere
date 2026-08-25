import { Navigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import type { ReactNode } from 'react';

export function RequireWallet({ children }: { children: ReactNode }) {
  const { wallet } = useWallet();
  if (!wallet) {
    return <Navigate to="/" replace />;
  }
  return children;
}
