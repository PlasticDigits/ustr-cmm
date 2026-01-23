/**
 * Dashboard Page
 * 
 * Shows user balances, token statistics, and holder information.
 */

import { BalanceCard } from '../components/dashboard/BalanceCard';
import { StatsCard } from '../components/dashboard/StatsCard';
import { useTokenStats } from '../hooks/useTokenStats';
import { Card, CardContent } from '../components/common/Card';
import { formatAmount } from '../utils/format';
import { DECIMALS } from '../utils/constants';

export function DashboardPage() {
  const { holderCount, tokenInfo, isLoading } = useTokenStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">Overview of USTR token and swap statistics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Balance Card */}
        <BalanceCard />

        {/* Token Statistics Card */}
        <Card className="h-full">
          <CardContent>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Token Statistics</h3>
            </div>

            <div className="space-y-3">
              {/* Holder Count */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="text-purple-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-300">Token Holders</p>
                </div>
                <p className="text-lg font-mono-numbers font-semibold text-white">
                  {isLoading ? (
                    <span className="inline-block w-16 h-5 bg-white/10 rounded animate-pulse" />
                  ) : (
                    holderCount.toLocaleString()
                  )}
                </p>
              </div>

              {/* Total Supply */}
              {tokenInfo && (
                <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="text-blue-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-300">Total Supply</p>
                  </div>
                  <p className="text-lg font-mono-numbers font-semibold text-white">
                    {isLoading ? (
                      <span className="inline-block w-24 h-5 bg-white/10 rounded animate-pulse" />
                    ) : (
                      <>
                        {formatAmount(tokenInfo.total_supply, DECIMALS.USTR)}
                        <span className="text-sm text-gray-400 ml-1">USTR</span>
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Swap Statistics */}
      <StatsCard />
    </div>
  );
}
