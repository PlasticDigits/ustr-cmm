/**
 * IssuanceCard Component
 * 
 * Displays token issuance statistics for UST1 or USTR tokens with:
 * - Token icon with gradient background
 * - Coming Soon badge support
 * - Animated counters for minted, burned, and circulating supply
 */

import { Card, CardContent } from '../common/Card';
import { TokenIcon } from '../common/TokenIcon';
import { formatAmount } from '../../utils/format';
import { TokenIssuance } from '../../types/treasury';

interface IssuanceCardProps {
  tokenName: string;
  tokenSymbol: string;
  issuance: TokenIssuance;
  decimals: number;
  gradient: string;
  isLoading?: boolean;
  notLaunched?: boolean;
}

export function IssuanceCard({ tokenName, tokenSymbol, issuance, decimals, gradient, isLoading = false, notLaunched = false }: IssuanceCardProps) {
  const mintedFormatted = formatAmount(issuance.minted, decimals, 0);
  const burnedFormatted = formatAmount(issuance.burned, decimals, 0);
  const supplyFormatted = formatAmount(issuance.supply, decimals, 0);

  return (
    <Card className="h-full">
      <CardContent>
        <div className="flex items-center gap-3 mb-5">
          <TokenIcon symbol={tokenSymbol} size="md" gradient={gradient} />
          <div>
            <h3 className="text-lg font-semibold text-white">{tokenName} Issuance</h3>
            <p className="text-sm text-gray-400">{tokenSymbol}</p>
          </div>
          {notLaunched && (
            <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/30">
              Coming Soon
            </span>
          )}
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-sm text-gray-300">Total Minted</span>
            </div>
            <span className="font-mono-numbers font-semibold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-5 bg-white/10 rounded animate-pulse" />
              ) : (
                mintedFormatted
              )}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              <span className="text-sm text-gray-300">Total Burned</span>
            </div>
            <span className="font-mono-numbers font-semibold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-5 bg-white/10 rounded animate-pulse" />
              ) : (
                burnedFormatted
              )}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm text-gray-300">Circulating Supply</span>
            </div>
            <span className="font-mono-numbers font-semibold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-5 bg-white/10 rounded animate-pulse" />
              ) : (
                supplyFormatted
              )}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}