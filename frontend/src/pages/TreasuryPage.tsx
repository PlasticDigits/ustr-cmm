/**
 * Treasury Page
 *
 * Shows treasury reserves, asset holdings, token issuance, wrap supplies, and key ratios.
 */

import { TreasuryAssetsCard, IssuanceCard, RatiosCard } from '../components/treasury';
import { useTreasury, EMPTY_RATIOS } from '../hooks/useTreasury';
import { NETWORKS, CONTRACTS, DEFAULT_NETWORK } from '../utils/constants';

export function TreasuryPage() {
  const { treasuryData, isLoading, error } = useTreasury();
  const scanner = NETWORKS[DEFAULT_NETWORK].scanner;
  const contracts = CONTRACTS[DEFAULT_NETWORK];
  const emptyIssuance = {
    outstanding: BigInt(0),
    cmmOwned: BigInt(0),
    availableSupply: BigInt(0),
    inventoryKnown: false,
  };

  return (
    <>
      <div className="text-center mb-10 md:mb-14 animate-fade-in-up stagger-1">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 md:mb-6">
          <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 bg-clip-text text-transparent">
            Treasury
          </span>
          {' '}Reserves
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-lg">
          Transparent view of treasury assets backing UST1. Collateralization uses
          non-protocol assets over UST1 available supply (outstanding minus CMM-owned).
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 animate-fade-in-up">
          Failed to load treasury data: {error}
        </div>
      )}

      <div className="mb-8 md:mb-10 animate-fade-in-up stagger-2">
        <TreasuryAssetsCard 
          assets={treasuryData?.assets ?? {}} 
          isLoading={isLoading}
          explorerUrl={`${scanner}/address/${contracts.treasury}`}
        />
        {Object.values(treasuryData?.assets ?? {}).some((a) => a.kind === 'lp') && (
          <p className="text-xs text-gray-500 mt-3">
            Protocol LP rows use reserve NAV (share of both sides). UST1, USTR, cLUNC, and cUSTC
            legs are shown in USD but omitted from collateralization — they are not CR assets.
            Native LUNC/USTC still count.
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-8 md:mb-10">
        <div className="animate-fade-in-up stagger-3">
          <IssuanceCard
            tokenName="UST1"
            tokenSymbol="UST1"
            issuance={treasuryData?.ust1Issuance ?? emptyIssuance}
            decimals={6}
            gradient="from-emerald-500/20 to-teal-500/20"
            isLoading={isLoading}
            isCrDenominator
            explorerUrl={contracts.ust1Token ? `${scanner}/address/${contracts.ust1Token}` : undefined}
          />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <IssuanceCard
            tokenName="USTR"
            tokenSymbol="USTR"
            issuance={treasuryData?.ustrIssuance ?? emptyIssuance}
            decimals={18}
            gradient="from-amber-500/20 to-orange-500/20"
            isLoading={isLoading}
            explorerUrl={`${scanner}/address/${contracts.ustrToken}`}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-8 md:mb-10">
        <div className="animate-fade-in-up stagger-5">
          <IssuanceCard
            tokenName="cLUNC"
            tokenSymbol="cLUNC"
            heading="cLUNC Supply"
            issuance={treasuryData?.cLuncIssuance ?? emptyIssuance}
            decimals={6}
            gradient="from-yellow-500/20 to-orange-500/20"
            isLoading={isLoading && treasuryData?.cLuncIssuance === undefined}
            explorerUrl={contracts.cLunc ? `${scanner}/address/${contracts.cLunc}` : undefined}
          />
        </div>
        <div className="animate-fade-in-up stagger-5">
          <IssuanceCard
            tokenName="cUSTC"
            tokenSymbol="cUSTC"
            heading="cUSTC Supply"
            issuance={treasuryData?.cUstcIssuance ?? emptyIssuance}
            decimals={6}
            gradient="from-blue-500/20 to-cyan-500/20"
            isLoading={isLoading && treasuryData?.cUstcIssuance === undefined}
            explorerUrl={contracts.cUstc ? `${scanner}/address/${contracts.cUstc}` : undefined}
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 -mt-6 mb-8 md:mb-10">
        cLUNC and cUSTC available supply is informational. They are not extra UST1
        collateral — treasury already counts native LUNC/USTC, and wrap legs are omitted from CR.
      </p>

      <div className="animate-fade-in-up stagger-5">
        <RatiosCard 
          ratios={treasuryData?.ratios ?? EMPTY_RATIOS} 
          isLoading={isLoading} 
        />
      </div>
    </>
  );
}
