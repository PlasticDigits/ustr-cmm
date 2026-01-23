/**
 * Dashboard Page
 *
 * Shows aggregate protocol statistics (similar style to Swap Statistics).
 */

import { Card, CardContent } from '../components/common/Card';
import { formatAmount } from '../utils/format';
import { DECIMALS } from '../utils/constants';
import { useSwapConfig, useTokenHoldersCount, useTokenInfo, useTreasuryUstcBalance } from '../hooks';

export function DashboardPage() {
  const { data: swapConfig } = useSwapConfig();

  const {
    data: holderCount,
    isLoading: holdersLoading,
    error: holdersError,
  } = useTokenHoldersCount(swapConfig?.ustr_token, { verifyBalances: false });

  const {
    data: tokenInfo,
    isLoading: tokenInfoLoading,
    error: tokenInfoError,
  } = useTokenInfo(swapConfig?.ustr_token);

  const {
    data: ustcTreasuryBalance,
    isLoading: ustcLoading,
    error: ustcError,
  } = useTreasuryUstcBalance();

  const enumeratedAccounts = holderCount?.count ?? 0;

  const stats = [
    {
      label: 'Enumerated Accounts',
      value: enumeratedAccounts > 0 ? enumeratedAccounts.toLocaleString('en-US') : '—',
      suffix: '',
      isLoading: holdersLoading,
      error: holdersError,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a4 4 0 00-4-4h-1M7 20H2v-2a4 4 0 014-4h1m0-4a3 3 0 116 0 3 3 0 01-6 0zm8-3a3 3 0 110 6 3 3 0 010-6z"
          />
        </svg>
      ),
      gradient: 'from-blue-500/20 to-indigo-500/20',
      iconColor: 'text-blue-400',
    },
    {
      label: 'Total USTR Supply',
      value: tokenInfo ? formatAmount(tokenInfo.total_supply, DECIMALS.USTR) : '—',
      suffix: 'USTR',
      isLoading: tokenInfoLoading,
      error: tokenInfoError,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      gradient: 'from-amber-500/20 to-orange-500/20',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Treasury USTC Reserve',
      value: ustcTreasuryBalance ? ustcTreasuryBalance.formatted : '—',
      suffix: 'USTC',
      isLoading: ustcLoading,
      error: ustcError,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      gradient: 'from-green-500/20 to-emerald-500/20',
      iconColor: 'text-green-400',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-white">Dashboard</h1>

      <Card>
        <CardContent>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">USTR Statistics</h2>
          </div>

          <div className="space-y-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`flex items-center justify-between p-4 rounded-xl bg-gradient-to-r ${stat.gradient} border border-white/5`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={stat.iconColor}>{stat.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm text-gray-300"
                      title={
                        stat.label === 'Enumerated Accounts'
                          ? 'Count of all CW20 accounts returned by the enumerable indexer, including zero-balance addresses.'
                          : undefined
                      }
                    >
                      {stat.label}
                    </p>
                    {stat.error && (
                      <p className="text-xs text-red-400 mt-1">
                        {stat.label === 'Enumerated Accounts' && 'Failed to load account count'}
                        {stat.label === 'Total USTR Supply' && 'Failed to load supply'}
                        {stat.label === 'Treasury USTC Reserve' && 'Failed to load treasury balance'}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-lg font-mono-numbers font-semibold text-white">
                  {stat.isLoading ? (
                    <span className="inline-block w-16 h-5 bg-white/10 rounded animate-pulse" />
                  ) : stat.error ? (
                    <span className="text-sm text-red-400">Error</span>
                  ) : (
                    <>
                      {stat.value}
                      {stat.suffix && (
                        <span className="text-sm text-gray-400 ml-1">{stat.suffix}</span>
                      )}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
