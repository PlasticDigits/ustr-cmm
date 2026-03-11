/**
 * Treasury Page
 * 
 * Shows treasury reserves, asset holdings, token issuance, and key ratios.
 */

import { TreasuryAssetsCard, IssuanceCard, RatiosCard } from '../components/treasury';
import { useTreasury } from '../hooks/useTreasury';
import { NETWORKS, CONTRACTS, DEFAULT_NETWORK } from '../utils/constants';

export function TreasuryPage() {
  const { treasuryData, isLoading, error } = useTreasury();

  return (
    <>
      {/* Hero Section */}
      <div className="text-center mb-10 md:mb-14 animate-fade-in-up stagger-1">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 md:mb-6">
          <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 bg-clip-text text-transparent">
            Treasury
          </span>
          {' '}Reserves
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-lg">
          Transparent view of all treasury assets backing UST1 and USTR tokens.
          Track collateralization ratios and token issuance in real-time.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 animate-fade-in-up">
          Failed to load treasury data: {error}
        </div>
      )}

      {/* Treasury Assets Section */}
      <div className="mb-8 md:mb-10 animate-fade-in-up stagger-2">
        <TreasuryAssetsCard 
          assets={treasuryData?.assets ?? {}} 
          isLoading={isLoading}
          explorerUrl={`${NETWORKS[DEFAULT_NETWORK].scanner}/address/${CONTRACTS[DEFAULT_NETWORK].treasury}`}
        />
      </div>

      {/* Issuance Section - 2 Column Grid */}
      <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-8 md:mb-10">
        <div className="animate-fade-in-up stagger-3">
          <IssuanceCard
            tokenName="UST1"
            tokenSymbol="UST1"
            issuance={treasuryData?.ust1Issuance ?? { minted: BigInt(0), burned: BigInt(0), supply: BigInt(0) }}
            decimals={6}
            gradient="from-emerald-500/20 to-teal-500/20"
            isLoading={isLoading}
            notLaunched={true}
          />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <IssuanceCard
            tokenName="USTR"
            tokenSymbol="USTR"
            issuance={treasuryData?.ustrIssuance ?? { minted: BigInt(0), burned: BigInt(0), supply: BigInt(0) }}
            decimals={18}
            gradient="from-amber-500/20 to-orange-500/20"
            isLoading={isLoading}
            explorerUrl={`${NETWORKS[DEFAULT_NETWORK].scanner}/address/${CONTRACTS[DEFAULT_NETWORK].ustrToken}`}
          />
        </div>
      </div>

      {/* Ratios Section */}
      <div className="animate-fade-in-up stagger-5">
        <RatiosCard 
          ratios={treasuryData?.ratios ?? { 
            collateralization: 0, 
            ustcPerUst1: 0, 
            assetsToLiabilities: 0, 
            ustrBacking: 0 
          }} 
          isLoading={isLoading} 
        />
      </div>
    </>
  );
}
