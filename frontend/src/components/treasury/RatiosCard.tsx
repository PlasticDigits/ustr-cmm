import { Card, CardContent } from '../common/Card';
import { TreasuryRatios } from '../../types/treasury';
import { CR_TIERS } from '../../utils/constants';

interface RatiosCardProps {
  ratios: TreasuryRatios;
  isLoading?: boolean;
}

/**
 * ECONOMICS.md tiers: RED &lt;95, YELLOW 95–110, GREEN 110–190, BLUE &gt;190.
 * ∞ (successful zero UST1 supply) is the healthiest state, not a color-band value.
 */
function getCollateralColor(ratio: number): string {
  if (Number.isNaN(ratio)) return 'text-gray-400';
  if (!Number.isFinite(ratio)) return 'text-emerald-400';
  if (ratio < CR_TIERS.redBelow) return 'text-red-400';
  if (ratio < CR_TIERS.yellowBelow) return 'text-amber-400';
  if (ratio <= CR_TIERS.greenAtMost) return 'text-emerald-400';
  return 'text-sky-400';
}

function formatRatio(value: number | undefined, decimals: number = 2): string {
  if (value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  if (!Number.isFinite(value)) {
    return '∞';
  }
  return value.toFixed(decimals);
}

function formatCollateralization(value: number): string {
  const formatted = formatRatio(value);
  if (formatted === 'N/A' || formatted === '∞') return formatted;
  return `${formatted}%`;
}

export function RatiosCard({ ratios, isLoading }: RatiosCardProps) {
  const {
    collateralization,
    ustcPerUst1,
    assetsToLiabilities,
    ustrBacking,
    incomplete,
    includedSymbols,
    missingPriceSymbols,
    ust1SupplyStatus,
  } = ratios;

  const collateralColor = getCollateralColor(collateralization);
  const collateralValue = formatCollateralization(collateralization);
  const ustcPerUst1Value = formatRatio(ustcPerUst1);
  const assetsToLiabilitiesDisplay = (() => {
    const v = formatRatio(assetsToLiabilities);
    return v === 'N/A' || v === '∞' ? v : `${v}x`;
  })();
  const ustrBackingValue = formatRatio(ustrBacking);

  return (
    <Card className="h-full">
      <CardContent>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Key Ratios</h3>
        </div>

        {incomplete && !isLoading && ust1SupplyStatus !== 'zero' && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs">
            Collateralization is <span className="font-semibold">incomplete</span>
            {includedSymbols.length > 0
              ? ` — includes ${includedSymbols.join(', ')}`
              : ' — no priced treasury assets yet'}
            {missingPriceSymbols.length > 0 && (
              <>. Unpriced balances omitted (not treated as $0): {missingPriceSymbols.join(', ')}.</>
            )}
            {ust1SupplyStatus === 'unknown' && (
              <> UST1 circulating supply is unavailable, so CR is N/A (not ∞).</>
            )}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
            <p className="text-sm text-gray-400 mb-1">Collateralization</p>
            <p className={`text-2xl font-mono-numbers font-bold ${collateralColor}`}>
              {isLoading ? (
                <span className="inline-block w-16 h-7 bg-white/10 rounded animate-pulse" />
              ) : (
                collateralValue
              )}
            </p>
          </div>
          
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
            <p className="text-sm text-gray-400 mb-1">USTC per UST1</p>
            <p className="text-2xl font-mono-numbers font-bold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-7 bg-white/10 rounded animate-pulse" />
              ) : (
                ustcPerUst1Value
              )}
            </p>
          </div>
          
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
            <p className="text-sm text-gray-400 mb-1">Assets/Liabilities</p>
            <p className="text-2xl font-mono-numbers font-bold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-7 bg-white/10 rounded animate-pulse" />
              ) : (
                assetsToLiabilitiesDisplay
              )}
            </p>
          </div>
          
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
            <p className="text-sm text-gray-400 mb-1">USTR Backing</p>
            <p className="text-2xl font-mono-numbers font-bold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-7 bg-white/10 rounded animate-pulse" />
              ) : (
                ustrBackingValue
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
