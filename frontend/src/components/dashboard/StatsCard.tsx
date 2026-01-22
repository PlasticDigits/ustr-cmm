/**
 * StatsCard Component
 * 
 * Displays key statistics for the swap with:
 * - Animated counters
 * - Gradient icons
 * - Responsive grid layout
 */

import { Card, CardContent } from '../common/Card';
import { formatAmount } from '../../utils/format';
import { DECIMALS } from '../../utils/constants';
import { useSwap } from '../../hooks/useSwap';

export function StatsCard() {
  const { swapStats, isLoading } = useSwap();

  const stats = [
    {
      label: 'Total USTC Received',
      value: swapStats ? formatAmount(swapStats.total_ustc_received, DECIMALS.USTC, 2) : '—',
      suffix: 'USTC',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      gradient: 'from-green-500/20 to-emerald-500/20',
      iconColor: 'text-green-400',
    },
    {
      label: 'Total USTR Minted',
      value: swapStats ? formatAmount(swapStats.total_ustr_minted, DECIMALS.USTR, 2) : '—',
      suffix: 'USTR',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      gradient: 'from-amber-500/20 to-orange-500/20',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Total Swaps (approx)',
      value: swapStats?.swap_count?.toString() ?? '—',
      suffix: '',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      gradient: 'from-blue-500/20 to-indigo-500/20',
      iconColor: 'text-blue-400',
    },
  ];

  return (
    <Card className="h-full">
      <CardContent>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Swap Statistics</h3>
        </div>
        
        <div className="space-y-3">
          {stats.map((stat) => (
            <div 
              key={stat.label}
              className={`flex items-center justify-between p-4 rounded-xl bg-gradient-to-r ${stat.gradient} border border-white/5`}
            >
              <div className="flex items-center gap-3">
                <div className={`${stat.iconColor}`}>
                  {stat.icon}
                </div>
                <p className="text-sm text-gray-300">{stat.label}</p>
              </div>
              <p className="text-lg font-mono-numbers font-semibold text-white">
                {isLoading ? (
                  <span className="inline-block w-16 h-5 bg-white/10 rounded animate-pulse" />
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
  );
}
