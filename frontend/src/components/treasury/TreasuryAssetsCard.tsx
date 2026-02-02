/**
 * TreasuryAssetsCard Component
 * 
 * Displays treasury asset holdings in a responsive grid layout.
 * Shows asset icons, names, and formatted balances with loading states.
 */

import { Card, CardContent } from '../common/Card';
import { TokenIcon } from '../common/TokenIcon';
import { TreasuryAsset } from '../../types/treasury';
import { formatAmount } from '../../utils/format';
import { usePrices } from '../../hooks/usePrices';

interface TreasuryAssetsCardProps {
  assets: Record<string, TreasuryAsset>;
  isLoading?: boolean;
}

export function TreasuryAssetsCard({ assets, isLoading = false }: TreasuryAssetsCardProps) {
  const assetEntries = Object.entries(assets);
  const { prices } = usePrices();
  
  // Helper function to format USD values
  const formatUsd = (value: number): string => {
    if (value < 0.01) {
      return `$${value.toFixed(6)}`;
    }
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  // Skeleton loading state
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Treasury Assets</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <div className="w-4 h-4 bg-white/20 rounded" />
                  </div>
                  <div className="h-4 w-20 bg-white/10 rounded" />
                </div>
                <div className="h-6 w-24 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Empty state
  if (assetEntries.length === 0) {
    return (
      <Card className="h-full">
        <CardContent>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Treasury Assets</h3>
          </div>
          
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-gray-400 text-center">
              No treasury assets found
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="h-full">
      <CardContent>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Treasury Assets</h3>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {assetEntries.map(([denom, asset], index) => {
            const displayBalance = Number(asset.balance) / Math.pow(10, asset.decimals);
            const priceUsd = prices[asset.displayName] ?? 0;
            const valueUsd = displayBalance * priceUsd;
            
            return (
              <div 
                key={denom}
                className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-white/5 to-white/5 border border-white/5 hover:border-white/10 transition-colors group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <TokenIcon 
                    symbol={asset.displayName} 
                    size="md" 
                    gradient={asset.gradient}
                    className="group-hover:scale-105 transition-transform"
                  />
                  <span className="font-medium text-white">{asset.displayName}</span>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-mono-numbers font-semibold ${asset.iconColor}`}>
                    {formatAmount(asset.balance, asset.decimals)}
                  </div>
                  {priceUsd > 0 && (
                    <div className="text-xs text-gray-400">
                      {formatUsd(valueUsd)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}