/**
 * BalanceCard Component
 * 
 * Displays user's token balances with:
 * - Token icons with gradients
 * - Hover animations
 * - Empty state for disconnected wallet
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
      decimals: 6,
      gradient: 'from-blue-500 to-cyan-500',
      bgGradient: 'from-blue-500/20 to-cyan-500/20',
      textColor: 'text-blue-400',
    },
    {
      token: 'USTR',
      amount: ustrBalance,
      decimals: 18,
      gradient: 'from-amber-500 to-orange-500',
      bgGradient: 'from-amber-500/20 to-orange-500/20',
      textColor: 'text-amber-400',
    },
    {
      token: 'LUNC',
      amount: luncBalance,
      decimals: 6,
      gradient: 'from-yellow-500 to-orange-500',
      bgGradient: 'from-yellow-500/20 to-orange-500/20',
      textColor: 'text-yellow-400',
    },
  ];

  return (
    <Card className="h-full">
      <CardContent>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Your Balances</h3>
        </div>
        
        {!connected ? (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-gray-400 text-center">
              Connect your wallet to view balances
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {balances.map((balance) => (
              <div 
                key={balance.token}
                className={`flex items-center justify-between p-4 rounded-xl bg-gradient-to-r ${balance.bgGradient} border border-white/5 hover:border-white/10 transition-colors group`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${balance.gradient} flex items-center justify-center text-white font-bold text-sm shadow-lg group-hover:scale-105 transition-transform`}>
                    {balance.token[0]}
                  </div>
                  <span className="font-medium text-white">{balance.token}</span>
                </div>
                <span className={`text-lg font-mono-numbers font-semibold ${balance.textColor}`}>
                  {formatAmount(balance.amount, balance.decimals)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
