/**
 * USTR CMM Frontend Application
 * 
 * Main application component providing:
 * - Wallet connection (Terra Station, WalletConnect, Keplr)
 * - USTC to USTR swap interface
 * - Dashboard with balances and stats
 * - Treasury view
 * - Referral code registration and management
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { TreasuryPage } from './pages/TreasuryPage';
import { ReferralPage } from './pages/ReferralPage';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/treasury" element={<TreasuryPage />} />
            <Route path="/referral" element={<ReferralPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
