/**
 * Home Page Component
 * 
 * Main swap interface page with:
 * - Launch countdown timer
 * - Hero section
 * - Swap card and rate chart
 * - Info cards with staggered animations
 */

import { SwapCard, RateChart } from '../components/swap';
import { StatsCard, BalanceCard } from '../components/dashboard';
import { CountdownTimer } from '../components/common';
import { useTickingRate } from '../hooks/useTickingRate';

export function HomePage() {
  // Ticking rate based on fixed launch time (Jan 22, 2026 13:00 UTC)
  const { tickingRate, elapsedSeconds, isLaunched } = useTickingRate();
  return (
    <>
      {/* Countdown Timer */}
      <div className="mb-10 md:mb-14">
        <CountdownTimer />
      </div>

      {/* Hero Section */}
      <div className="text-center mb-10 md:mb-14 animate-fade-in-up stagger-1">
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 md:mb-6 tracking-tight">
          Collateralized{' '}
          <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 bg-clip-text text-transparent">
            Unstablecoin
          </span>
          <br className="sm:hidden" />
          {' '}System
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-lg lg:text-xl leading-relaxed px-4">
          Swap your USTC for USTR at favorable rates. Early participants receive
          better exchange rates as the system builds its treasury reserves.
        </p>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-2 gap-6 md:gap-8 mb-10 md:mb-14">
        {/* Left: Swap Card */}
        <div className="lg:order-1">
          <SwapCard />
        </div>

        {/* Right: Rate Chart */}
        <div className="lg:order-2 animate-fade-in-up stagger-3">
          <RateChart 
            tickingRate={isLaunched ? tickingRate : undefined}
            elapsedSeconds={isLaunched ? elapsedSeconds : undefined}
          />
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-10 md:mb-14">
        <div className="animate-fade-in-up stagger-4">
          <StatsCard />
        </div>
        <div className="animate-fade-in-up stagger-5">
          <BalanceCard />
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <InfoCard
          title="Early Advantage"
          description="Day 0 participants pay 1.5 USTC per USTR, while Day 100 participants pay 2.5 USTC — a 66% premium."
          icon={<ChartIcon />}
          gradient="from-emerald-500/20 to-teal-500/20"
          iconBg="bg-emerald-500/20"
          iconColor="text-emerald-400"
          delay={1}
        />
        <InfoCard
          title="Treasury Backed"
          description="All deposited USTC flows directly to the treasury as collateral for the future UST1 unstablecoin."
          icon={<ShieldIcon />}
          gradient="from-blue-500/20 to-indigo-500/20"
          iconBg="bg-blue-500/20"
          iconColor="text-blue-400"
          delay={2}
        />
        <InfoCard
          title="Transparent"
          description="All transactions are on-chain. Track the treasury, swap rates, and statistics in real-time."
          icon={<SearchIcon />}
          gradient="from-purple-500/20 to-pink-500/20"
          iconBg="bg-purple-500/20"
          iconColor="text-purple-400"
          delay={3}
        />
      </div>
    </>
  );
}

interface InfoCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  iconColor: string;
  delay: number;
}

function InfoCard({ title, description, icon, gradient, iconBg, iconColor, delay }: InfoCardProps) {
  return (
    <div 
      className={`
        group relative p-5 md:p-6 rounded-2xl border border-white/5 
        bg-gradient-to-br ${gradient} backdrop-blur-sm
        hover:border-white/10 hover:scale-[1.02] 
        transition-all duration-300 cursor-default
        animate-fade-in-up
      `}
      style={{ animationDelay: `${0.5 + delay * 0.1}s` }}
    >
      {/* Icon */}
      <div className={`
        w-12 h-12 rounded-xl ${iconBg} 
        flex items-center justify-center mb-4
        group-hover:scale-110 transition-transform duration-300
      `}>
        <div className={iconColor}>
          {icon}
        </div>
      </div>
      
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

// SVG Icons
function ChartIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}
