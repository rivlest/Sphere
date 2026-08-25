import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import { Dashboard } from './components/Dashboard';
import { ReceiveView } from './components/ReceiveView';
import { RequireWallet } from './components/RequireWallet';
import { SendForm } from './components/SendForm';
import { Shell } from './components/Shell';
import { WalletCreate } from './components/WalletCreate';
import { WalletImport } from './components/WalletImport';
import { Welcome } from './components/Welcome';

export function App() {
  return (
    <WalletProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Welcome />} />
            <Route path="/create" element={<WalletCreate />} />
            <Route path="/import" element={<WalletImport />} />
            <Route
              path="/dashboard"
              element={
                <RequireWallet>
                  <Dashboard />
                </RequireWallet>
              }
            />
            <Route
              path="/send"
              element={
                <RequireWallet>
                  <SendForm />
                </RequireWallet>
              }
            />
            <Route
              path="/receive"
              element={
                <RequireWallet>
                  <ReceiveView />
                </RequireWallet>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
}

export default App;
