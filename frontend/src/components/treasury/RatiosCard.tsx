import { Card, CardContent } from '../common/Card';
import { TreasuryRatios } from '../../types/treasury';

interface RatiosCardProps {
  ratios: TreasuryRatios;
  isLoading?: boolean;
}

/**
 * Gets the appropriate text color based on ratio value and type
 * @param ratio - The ratio value to check
 * @param type - Type of ratio ('collateral' or 'general')
 * @returns Tailwind text color class
 */
function getStatusColor(ratio: number, type: 'collateral' | 'general'): string {
  if (type === 'collateral') {
    if (ratio >= 100) return 'text-emerald-400';
    if (ratio >= 50) return 'text-amber-400';
    return 'text-red-400';
  }
  return 'text-white';
}

/**
 * Formats a ratio value with specified decimal places
 * @param value - The ratio value to format
 * @param decimals - Number of decimal places to show
 * @returns Formatted string or 'N/A' if value is invalid
 */
function formatRatio(value: number | undefined, decimals: number = 2): string {
  if (value === undefined || isNaN(value) || !isFinite(value)) {
    return 'N/A';
  }
  return value.toFixed(decimals);
}

/**
 * RatiosCard Component
 * 
 * Displays key treasury ratios and metrics in a responsive grid layout:
 * - Collateralization with color coding
 * - USTC per UST1
 * - Assets/Liabilities ratio
 * - USTR backing
 */

export function RatiosCard({ ratios, isLoading }: RatiosCardProps) {
  const {
    collateralization,
    ustcPerUst1,
    assetsToLiabilities,
    ustrBacking,
  } = ratios;

  const collateralColor = getStatusColor(collateralization, 'collateral');
  const collateralValue = formatRatio(collateralization);

  const ustcPerUst1Value = formatRatio(ustcPerUst1);
  const assetsToLiabilitiesValue = formatRatio(assetsToLiabilities);
  const ustrBackingValue = formatRatio(ustrBacking);

  return (
    <Card className="h-full">
      <CardContent>
        {/* Card Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Key Ratios</h3>
        </div>
        
        {/* Ratios Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Collateralization */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
            <p className="text-sm text-gray-400 mb-1">Collateralization</p>
            <p className={`text-2xl font-mono-numbers font-bold ${collateralColor}`}>
              {isLoading ? (
                <span className="inline-block w-16 h-7 bg-white/10 rounded animate-pulse" />
              ) : (
                `${collateralValue}%`
              )}
            </p>
          </div>
          
          {/* USTC per UST1 */}
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
          
          {/* Assets/Liabilities */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
            <p className="text-sm text-gray-400 mb-1">Assets/Liabilities</p>
            <p className="text-2xl font-mono-numbers font-bold text-white">
              {isLoading ? (
                <span className="inline-block w-16 h-7 bg-white/10 rounded animate-pulse" />
              ) : (
                `${assetsToLiabilitiesValue}x`
              )}
            </p>
          </div>
          
          {/* USTR Backing */}
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
