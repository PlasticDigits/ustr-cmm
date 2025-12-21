/**
 * USTR CMM Frontend Application
 * 
 * Main application component providing:
 * - Wallet connection (Terra Station, WalletConnect, Keplr)
 * - USTC to USTR swap interface
 * - Dashboard with balances and stats
 * - Treasury view
 * - Airdrop interface
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout';
import { SwapCard, RateChart } from './components/swap';
import { StatsCard, BalanceCard } from './components/dashboard';

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
      <Layout>
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Collateralized{' '}
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              Unstablecoin
            </span>{' '}
            System
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Swap your USTC for USTR at favorable rates. Early participants receive
            better exchange rates as the system builds its treasury reserves.
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* Left: Swap Card */}
          <div className="lg:order-1">
            <SwapCard />
          </div>

          {/* Right: Rate Chart */}
          <div className="lg:order-2">
            <RateChart currentDay={0} />
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <StatsCard />
          <BalanceCard />
        </div>

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          <InfoCard
            title="Early Advantage"
            description="Day 0 participants pay 1.5 USTC per USTR, while Day 100 participants pay 2.5 USTC — a 66% premium."
            icon="🚀"
          />
          <InfoCard
            title="Treasury Backed"
            description="All deposited USTC flows directly to the treasury as collateral for the future UST1 unstablecoin."
            icon="🏦"
          />
          <InfoCard
            title="Transparent"
            description="All transactions are on-chain. Track the treasury, swap rates, and statistics in real-time."
            icon="🔍"
          />
        </div>
      </Layout>
    </QueryClientProvider>
  );
}

interface InfoCardProps {
  title: string;
  description: string;
  icon: string;
}

function InfoCard({ title, description, icon }: InfoCardProps) {
  return (
    <div className="p-6 bg-gray-800/30 border border-gray-700/50 rounded-2xl">
      <span className="text-3xl mb-4 block">{icon}</span>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}

export default App;
