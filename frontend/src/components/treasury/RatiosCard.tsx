import { Card, CardContent } from '../common/Card';
import { TreasuryRatios } from '../../types/treasury';
import { CR_TIER_COPY, PRICES_NOT_LOADED_MESSAGE, crTierTextClass } from '../../utils/crTiers';

interface RatiosCardProps {
  ratios: TreasuryRatios;
  isLoading?: boolean;
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
    pricesReady,
    ust1SupplyStatus,
    tier,
  } = ratios;

  const showRatios = !isLoading && pricesReady && ust1SupplyStatus !== 'unknown' && tier !== null;
  const collateralColor = crTierTextClass(tier);
  const copy = tier ? CR_TIER_COPY[tier] : null;
  const collateralValue = formatCollateralization(collateralization);
  const ustcPerUst1Value = formatRatio(ustcPerUst1);
  const assetsToLiabilitiesDisplay = (() => {
    const v = formatRatio(assetsToLiabilities);
    return v === 'N/A' || v === '∞' ? v : `${v}x`;
  })();

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

        {!showRatios ? (
          <p className="text-sm text-gray-400 py-6 text-center">{PRICES_NOT_LOADED_MESSAGE}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
                <p className="text-sm text-gray-400 mb-1">Collateralization</p>
                <p className={`text-2xl font-mono-numbers font-bold ${collateralColor}`}>
                  {collateralValue}
                </p>
                {copy && (
                  <p className={`mt-1 text-xs font-semibold tracking-wide ${collateralColor}`}>
                    {copy.name}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
                <p className="text-sm text-gray-400 mb-1">USTC per available UST1</p>
                <p className="text-2xl font-mono-numbers font-bold text-white">
                  {ustcPerUst1Value}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
                <p className="text-sm text-gray-400 mb-1">Assets/Liabilities</p>
                <p className="text-2xl font-mono-numbers font-bold text-white">
                  {assetsToLiabilitiesDisplay}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-white/5 hover:border-amber-500/30 transition-all duration-300">
                <p className="text-sm text-gray-400 mb-1">System state</p>
                <p className={`text-2xl font-bold ${collateralColor}`}>
                  {copy?.system}
                </p>
              </div>
            </div>

            {copy && (
              <ul className="mt-4 space-y-1.5 text-sm text-gray-300">
                <li>{copy.swap}</li>
                <li>{copy.rewards}</li>
                <li>{copy.system}</li>
              </ul>
            )}
            <p className="mt-3 text-xs text-gray-500">
              Status display for intended swap / staking-reward bands. This page does not change
              on-chain mint, swap, or staking gates.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
