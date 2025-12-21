/**
 * BalanceCard Component
 * 
 * Displays user's token balances.
 */

import { Card, CardContent } from '../common/Card';
import { useWallet } from '../../hooks/useWallet';
import { formatAmount } from '../../utils/format';

export function BalanceCard() {
  const { connected, ustcBalance, ustrBalance, luncBalance } = useWallet();

  const balances = [
    {
      token: 'USTC',
      amount: ustcBalance,
      icon: '💵',
      color: 'text-green-400',
    },
    {
      token: 'USTR',
      amount: ustrBalance,
      icon: '🔶',
      color: 'text-amber-400',
    },
    {
      token: 'LUNC',
      amount: luncBalance,
      icon: '🌙',
      color: 'text-yellow-400',
    },
  ];

  if (!connected) {
    return (
      <Card>
        <CardContent>
          <h3 className="text-lg font-semibold text-white mb-4">Your Balances</h3>
          <p className="text-gray-400 text-center py-8">
            Connect your wallet to view balances
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <h3 className="text-lg font-semibold text-white mb-4">Your Balances</h3>
        <div className="space-y-3">
          {balances.map((balance) => (
            <div 
              key={balance.token}
              className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{balance.icon}</span>
                <span className="font-medium text-white">{balance.token}</span>
              </div>
              <span className={`text-lg font-semibold ${balance.color}`}>
                {formatAmount(balance.amount)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

