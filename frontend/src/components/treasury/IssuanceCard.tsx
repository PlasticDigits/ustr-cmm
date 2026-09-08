/**
 * IssuanceCard
 *
 * + Outstanding (CW20 total_supply)
 * − CMM-owned liquidity (treasury spot + allowlisted LP claims)
 *   Available Supply
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
  explorerUrl?: string;
  heading?: string;
  /** This token's available supply is part of CR CMM Liabilities. */
  isCrLiability?: boolean;
  /** Equity token (USTR): shown for inventory, omitted from CR liabilities. */
  isEquity?: boolean;
}

export function IssuanceCard({
  tokenName,
  tokenSymbol,
  issuance,
  decimals,
  gradient,
  isLoading = false,
  notLaunched = false,
  explorerUrl,
  heading,
  isCrLiability = false,
  isEquity = false,
}: IssuanceCardProps) {
  const outstandingFormatted = formatAmount(issuance.outstanding, decimals, 0);
  const cmmOwnedFormatted = formatAmount(issuance.cmmOwned, decimals, 0);
  const availableFormatted = formatAmount(issuance.availableSupply, decimals, 0);
  const inventoryKnown = issuance.inventoryKnown;

  return (
    <Card className="h-full" testId={`issuance-${tokenSymbol.toLowerCase()}`}>
      <CardContent>
        <div className="flex items-center gap-3 mb-5">
          <TokenIcon symbol={tokenSymbol} size="md" gradient={gradient} />
          <div>
            <h3 className="text-lg font-semibold text-white">{heading ?? `${tokenName} Issuance`}</h3>
            <p className="text-sm text-gray-400">{tokenSymbol}</p>
          </div>
          {notLaunched ? (
            <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/30">
              Coming Soon
            </span>
          ) : explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-amber-500/50 hover:bg-amber-500/10 text-gray-400 hover:text-amber-400 transition-all text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Token
            </a>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-sm text-gray-300">+ Outstanding</span>
            </div>
            <span className="font-mono-numbers font-semibold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-5 bg-white/10 rounded animate-pulse" />
              ) : (
                outstandingFormatted
              )}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
              <span className="text-sm text-gray-300">− CMM-owned liquidity</span>
            </div>
            <span className="font-mono-numbers font-semibold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-5 bg-white/10 rounded animate-pulse" />
              ) : inventoryKnown ? (
                cmmOwnedFormatted
              ) : (
                '—'
              )}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm text-amber-100">Available Supply</span>
            </div>
            <span className="font-mono-numbers font-semibold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-5 bg-white/10 rounded animate-pulse" />
              ) : inventoryKnown ? (
                availableFormatted
              ) : (
                '—'
              )}
            </span>
          </div>
        </div>
        {!notLaunched && (
          <p className="mt-3 text-xs text-gray-500">
            Available supply = outstanding − CMM-owned (treasury spot + allowlisted LP claims).
            {isCrLiability && ' Available supply is part of CR CMM Liabilities.'}
            {isEquity && ' USTR is equity, not a redeemable liability, and is omitted from CR CMM Liabilities.'}
            {!inventoryKnown && !isLoading && ' Inventory is incomplete — available supply is not certified.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
