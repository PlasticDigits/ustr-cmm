/**
 * StatsCard Component
 * 
 * Displays key statistics for the swap.
 */

import { Card, CardContent } from '../common/Card';
import { formatAmount } from '../../utils/format';
import { useSwap } from '../../hooks/useSwap';

export function StatsCard() {
  const { swapStats, isLoading } = useSwap();

  const stats = [
    {
      label: 'Total USTC Received',
      value: swapStats ? formatAmount(swapStats.total_ustc_received) : '—',
      suffix: 'USTC',
    },
    {
      label: 'Total USTR Minted',
      value: swapStats ? formatAmount(swapStats.total_ustr_minted) : '—',
      suffix: 'USTR',
    },
    {
      label: 'Total Swaps',
      value: swapStats?.swap_count?.toString() ?? '—',
      suffix: '',
    },
  ];

  return (
    <Card>
      <CardContent>
        <h3 className="text-lg font-semibold text-white mb-4">Swap Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div 
              key={stat.label}
              className="p-4 bg-gray-900/50 rounded-xl"
            >
              <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
              <p className="text-xl font-semibold text-white">
                {isLoading ? '...' : stat.value}
                {stat.suffix && (
                  <span className="text-sm text-gray-400 ml-1">{stat.suffix}</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

