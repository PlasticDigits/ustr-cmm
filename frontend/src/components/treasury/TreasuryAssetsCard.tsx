/**
 * TreasuryAssetsCard
 *
 * Responsive holdings grid. Layout / copy only (#21) — CR, NAV, dust filter,
 * and on-chain queries stay in useTreasury / lpNav / treasuryRatios.
 *
 * Breakpoints: 1-col phones, 2-col through tablet including 1024 (`lg`),
 * 3-col at `xl` (1280+). Tiles stack identity over values so long LP labels
 * and haircut lines wrap instead of ellipsis (iPad has no hover).
 *
 * Playbook: skills/frontend-treasury-assets-layout/SKILL.md
 */

import { Card, CardContent } from '../common/Card';
import { TokenIcon } from '../common/TokenIcon';
import { TreasuryAsset } from '../../types/treasury';
import { formatPoolShare } from '../../utils/format';
import {
  TREASURY_ASSETS_GRID_CLASS,
  formatTreasuryCardAmount,
  formatTreasuryCrHaircut,
  formatTreasuryUsd,
} from '../../utils/treasuryAssetDisplay';
import { usePrices } from '../../hooks/usePrices';
import { DEFAULT_NETWORK, NETWORKS } from '../../utils/constants';

interface TreasuryAssetsCardProps {
  assets: Record<string, TreasuryAsset>;
  isLoading?: boolean;
  explorerUrl?: string;
}

function pairSymbolsForAsset(asset: TreasuryAsset): [string, string] | undefined {
  if (asset.kind !== 'lp') return undefined;
  if (asset.pairSymbols?.[0] && asset.pairSymbols[1]) return asset.pairSymbols;
  const parts = asset.displayName.split('-');
  if (parts.length === 2 && parts[0] && parts[1]) return [parts[0], parts[1]];
  return undefined;
}

function AssetsCardHeader({ explorerUrl }: { explorerUrl?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-white">Treasury Assets</h3>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="treasury-assets-view-contract"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-amber-500/50 hover:bg-amber-500/10 text-gray-400 hover:text-amber-400 transition-all text-xs"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View Contract
        </a>
      )}
    </div>
  );
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) {
    return 'bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-500 text-yellow-950 ring-yellow-400/40 shadow-[0_0_6px_rgba(251,191,36,0.5)]';
  }
  if (rank === 2) {
    return 'bg-gradient-to-br from-gray-200 via-slate-300 to-gray-400 text-slate-800 ring-gray-300/40 shadow-[0_0_6px_rgba(148,163,184,0.4)]';
  }
  if (rank === 3) {
    return 'bg-gradient-to-br from-orange-300 via-amber-600 to-orange-700 text-orange-950 ring-orange-500/40 shadow-[0_0_6px_rgba(234,88,12,0.35)]';
  }
  return 'bg-gray-800/90 text-gray-400 ring-gray-700/50';
}

function AssetTile({
  asset,
  rank,
  valueUsd,
  scanner,
  index,
}: {
  asset: TreasuryAsset;
  rank: number;
  valueUsd: number;
  scanner: string;
  index: number;
}) {
  const isTopThree = rank >= 1 && rank <= 3;
  const haircutLine =
    asset.haircutLegs && asset.haircutLegs.length > 0
      ? formatTreasuryCrHaircut(asset.crUsd, asset.haircutLegs)
      : null;
  const label = asset.pairLabel || asset.displayName;

  return (
    <div
      data-testid={`treasury-asset-${asset.displayName}`}
      className="flex flex-col gap-3 p-4 rounded-xl bg-gradient-to-r from-white/5 to-white/5 border border-white/5 hover:border-white/10 transition-colors group min-w-0 xl:flex-row xl:items-start xl:justify-between xl:gap-3"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <TokenIcon
            symbol={asset.displayName}
            pairSymbols={pairSymbolsForAsset(asset)}
            size="md"
            gradient={asset.gradient}
            className="group-hover:scale-105 transition-transform"
          />
          {rank > 0 && (
            <span
              data-testid="treasury-asset-rank"
              className={`absolute -top-1.5 -left-1.5 flex items-center justify-center rounded-full ring-1 font-bold ${rankBadgeClass(rank)} ${isTopThree ? 'w-[22px] h-[22px] text-[10px]' : 'w-[18px] h-[18px] text-[9px]'}`}
            >
              {rank}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <span className="font-medium text-white break-words">{label}</span>
          {asset.kind === 'lp' && asset.explorerAddress && (
            <a
              href={`${scanner}/address/${asset.explorerAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="treasury-asset-pair"
              className="block text-[10px] text-gray-500 hover:text-amber-400"
            >
              Pair
            </a>
          )}
        </div>
      </div>
      <div className="min-w-0 w-full xl:w-auto xl:max-w-[58%] xl:text-right">
        <div
          data-testid="treasury-asset-primary"
          className={`text-sm sm:text-base xl:text-lg font-mono-numbers font-semibold break-words ${asset.iconColor}`}
        >
          {asset.kind === 'lp'
            ? formatPoolShare(asset.poolShare)
            : formatTreasuryCardAmount(asset.balance, asset.decimals)}
        </div>
        {valueUsd > 0 && (
          <div data-testid="treasury-asset-usd" className="text-xs text-gray-400 break-words">
            {formatTreasuryUsd(valueUsd)}
            {asset.displayName === 'vFDUSD' && (
              <span className="ml-1 text-gray-500">
                · session oracle
              </span>
            )}
          </div>
        )}
        {haircutLine && (
          <div data-testid="treasury-asset-cr" className="text-[10px] text-gray-500 break-words">
            {haircutLine}
          </div>
        )}
        {asset.kind === 'lp' && asset.navIncomplete && (
          <div data-testid="treasury-asset-nav-incomplete" className="text-[10px] text-amber-400/80 break-words">
            {asset.missingPriceLegs && asset.missingPriceLegs.length > 0
              ? `NAV incomplete · ${asset.missingPriceLegs.join(', ')}`
              : 'NAV incomplete'}
          </div>
        )}
      </div>
    </div>
  );
}

export function TreasuryAssetsCard({ assets, isLoading = false, explorerUrl }: TreasuryAssetsCardProps) {
  const { prices, luncUsd, ustcUsd } = usePrices();
  const scanner = NETWORKS[DEFAULT_NETWORK].scanner;

  const getPriceUsd = (displayName: string): number => {
    const fromMap = prices[displayName];
    if (fromMap !== undefined && fromMap > 0) return fromMap;
    if (displayName === 'LUNC' && luncUsd > 0) return luncUsd;
    if (displayName === 'USTC' && ustcUsd > 0) return ustcUsd;
    return fromMap ?? 0;
  };

  const getUsdValue = (asset: TreasuryAsset): number => {
    if (asset.kind === 'lp' || asset.protocolIssued) {
      return asset.displayUsd && asset.displayUsd > 0 ? asset.displayUsd : 0;
    }
    const displayBalance = Number(asset.balance) / Math.pow(10, asset.decimals);
    const priceUsd = getPriceUsd(asset.displayName);
    return displayBalance * priceUsd;
  };

  // Prefer hiding sub-$1 dust when we have USD prices; if price is unavailable (0), still show non-zero balances
  const shouldShowAsset = (asset: TreasuryAsset): boolean => {
    if (asset.balance <= 0n) return false;
    if (asset.protocolIssued) return true;
    if (asset.kind === 'lp') {
      if (asset.displayUsd === null || asset.displayUsd === undefined) return true;
      return asset.displayUsd >= 1;
    }
    const px = getPriceUsd(asset.displayName);
    if (px <= 0) return true;
    return getUsdValue(asset) >= 1;
  };

  const assetEntries = Object.entries(assets)
    .filter(([, asset]) => shouldShowAsset(asset))
    .sort(([, a], [, b]) => {
      const vb = getUsdValue(b);
      const va = getUsdValue(a);
      if (vb !== va) return vb - va;
      return Number(b.balance) / 10 ** b.decimals - Number(a.balance) / 10 ** a.decimals;
    });

  if (isLoading) {
    return (
      <Card className="h-full" testId="treasury-assets">
        <CardContent>
          <AssetsCardHeader />
          <div className={TREASURY_ASSETS_GRID_CLASS} data-testid="treasury-assets-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-3 p-4 rounded-xl bg-white/5 border border-white/5 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <div className="w-4 h-4 bg-white/20 rounded" />
                  </div>
                  <div className="h-4 w-20 bg-white/10 rounded" />
                </div>
                <div className="space-y-2">
                  <div className="h-6 w-28 bg-white/10 rounded" />
                  <div className="h-3 w-16 bg-white/10 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (assetEntries.length === 0) {
    return (
      <Card className="h-full" testId="treasury-assets">
        <CardContent>
          <AssetsCardHeader />
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
    <Card className="h-full" testId="treasury-assets">
      <CardContent>
        <AssetsCardHeader explorerUrl={explorerUrl} />
        <div className={TREASURY_ASSETS_GRID_CLASS} data-testid="treasury-assets-grid">
          {assetEntries.map(([denom, asset], index) => {
            const valueUsd = getUsdValue(asset);
            const isUstc = asset.displayName === 'USTC';
            const competitiveIndex = isUstc
              ? -1
              : assetEntries
                  .slice(0, index)
                  .filter(([, a]) => a.displayName !== 'USTC')
                  .length;
            const rank = isUstc ? 0 : competitiveIndex + 1;

            return (
              <AssetTile
                key={denom}
                asset={asset}
                rank={rank}
                valueUsd={valueUsd}
                scanner={scanner}
                index={index}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
