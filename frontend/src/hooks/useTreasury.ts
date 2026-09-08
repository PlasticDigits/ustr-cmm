/**
 * useTreasury Hook
 *
 * Fetches treasury holdings from tokenlist.json plus protocol-token inventory.
 * Total CMM Assets include protocol issued tokens held spot or in CMM LP.
 * CR CMM Assets omit those. CR denominator is available UST1 + cUSTC + cLUNC
 * (debt) and USTR (equity). Key Ratios stay hidden until every CR price and
 * CR liability is certified.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { contractService } from '../services/contract';
import { fetchTreasuryLpPositions, type LpChainPosition } from '../services/treasuryLp';
import { CONTRACTS, DEFAULT_NETWORK, POLLING_INTERVAL } from '../utils/constants';
import { isTerraContractAddress } from '../utils/addresses';
import { isRawProtocolHolding, resolveLpLegUsd } from '../utils/lpEligibility';
import { computeLpNav, type LpNavLegInput } from '../utils/lpNav';
import { fetchTokenList } from '../utils/tokenlist';
import { computeTreasuryRatios, type ProtocolLiabilityInput, type RatioAssetInput } from '../utils/treasuryRatios';
import {
  aggregateProtocolOwned,
  toIssuanceBreakdown,
  type ProtocolTokenId,
  type TokenIssuanceBreakdown,
} from '../utils/availableSupply';
import { PROTOCOL_HOLDING_META, protocolHoldingUsd, protocolTokenUnitUsd, resolveUstrUsd } from '../utils/protocolHoldings';
import { isLpTokenListEntry } from '../types/tokenlist';
import type { TreasuryData, TreasuryAsset, TokenIssuance, TreasuryRatios } from '../types/treasury';
import { usePrices } from './usePrices';

const contracts = CONTRACTS[DEFAULT_NETWORK];

interface TreasuryChainData {
  assets: Record<string, TreasuryAsset>;
  lpPositions: LpChainPosition[];
  protocolSpot: Record<ProtocolTokenId, bigint | null>;
  ust1Issuance: TokenIssuance;
  ustrIssuance: TokenIssuance;
  cLuncIssuance: TokenIssuance | null;
  cUstcIssuance: TokenIssuance | null;
  lastUpdated: Date;
}

async function fetchCw20Supply(address: string): Promise<bigint | null> {
  if (!isTerraContractAddress(address)) return null;
  const info = await contractService.getTokenInfoStrict(address);
  return BigInt(info.total_supply || '0');
}

async function fetchCw20Spot(tokenAddress: string, holder: string): Promise<bigint | null> {
  if (!isTerraContractAddress(tokenAddress) || !isTerraContractAddress(holder)) return null;
  const result = await contractService.getTokenBalanceStrict(tokenAddress, holder);
  return BigInt(result.balance || '0');
}

async function safeSupply(address: string, label: string): Promise<bigint | null> {
  if (!isTerraContractAddress(address)) return null;
  try {
    return await fetchCw20Supply(address);
  } catch (error) {
    console.error(`Failed to fetch ${label} token info:`, error);
    return null;
  }
}

async function safeSpot(address: string, holder: string, label: string): Promise<bigint | null> {
  if (!isTerraContractAddress(address) || !isTerraContractAddress(holder)) return null;
  try {
    return await fetchCw20Spot(address, holder);
  } catch (error) {
    console.error(`Failed to fetch treasury ${label} balance:`, error);
    return null;
  }
}

function issuanceFor(
  outstanding: bigint | null,
  owned: bigint | null
): TokenIssuanceBreakdown {
  return toIssuanceBreakdown(outstanding, owned);
}

async function fetchTreasuryData(): Promise<TreasuryChainData> {
  const tokenList = await fetchTokenList();
  const assets: Record<string, TreasuryAsset> = {};

  for (const token of tokenList.tokens) {
    if (isLpTokenListEntry(token) || isRawProtocolHolding(token)) continue;

    try {
      let balance = BigInt(0);

      if (token.type === 'native' && token.denom) {
        const balanceStr = await contractService.getNativeBalance(contracts.treasury, token.denom);
        balance = BigInt(balanceStr || '0');
      } else if (token.type === 'cw20' && token.address) {
        const result = await contractService.getTokenBalance(token.address, contracts.treasury);
        balance = BigInt(result.balance || '0');
      } else {
        continue;
      }

      assets[token.symbol.toLowerCase()] = {
        denom: token.denom || token.address || token.symbol.toLowerCase(),
        balance,
        decimals: token.decimals,
        displayName: token.symbol,
        gradient: token.gradient,
        iconColor: token.iconColor,
        kind: 'spot',
      };
    } catch (error) {
      console.error(`Failed to fetch ${token.symbol} balance:`, error);
    }
  }

  const lpPositions = await fetchTreasuryLpPositions(tokenList, contracts.treasury);

  // Sequential: contractService spaces LCD per path; do not burst protocol inventory.
  const ust1Outstanding = await safeSupply(contracts.ust1Token, 'UST1');
  const ustrOutstanding = await safeSupply(contracts.ustrToken, 'USTR');
  const cLuncOutstanding = await safeSupply(contracts.cLunc, 'cLUNC');
  const cUstcOutstanding = await safeSupply(contracts.cUstc, 'cUSTC');

  const ust1Spot = await safeSpot(contracts.ust1Token, contracts.treasury, 'UST1');
  const ustrSpot = await safeSpot(contracts.ustrToken, contracts.treasury, 'USTR');
  const cLuncSpot = await safeSpot(contracts.cLunc, contracts.treasury, 'cLUNC');
  const cUstcSpot = await safeSpot(contracts.cUstc, contracts.treasury, 'cUSTC');

  const owned = aggregateProtocolOwned(
    { ust1: ust1Spot, ustr: ustrSpot, cLunc: cLuncSpot, cUstc: cUstcSpot },
    lpPositions.map((pos) => ({
      lpAddress: pos.lpAddress,
      lpBalance: pos.lpBalance,
      totalShare: pos.totalShare,
      queryFailed: pos.queryFailed,
      balanceUnknown: pos.balanceUnknown,
      declaredProtocolIds: pos.declaredProtocolIds,
      legs: pos.legs,
    }))
  );

  const wrapIssuance = (id: ProtocolTokenId, outstanding: bigint | null): TokenIssuance | null => {
    if (!isTerraContractAddress(id === 'cLunc' ? contracts.cLunc : contracts.cUstc) && outstanding === null) {
      return null;
    }
    return issuanceFor(outstanding, owned[id]);
  };

  return {
    assets,
    lpPositions,
    protocolSpot: { ust1: ust1Spot, ustr: ustrSpot, cLunc: cLuncSpot, cUstc: cUstcSpot },
    ust1Issuance: issuanceFor(ust1Outstanding, owned.ust1),
    ustrIssuance: issuanceFor(ustrOutstanding, owned.ustr),
    cLuncIssuance: wrapIssuance('cLunc', cLuncOutstanding),
    cUstcIssuance: wrapIssuance('cUstc', cUstcOutstanding),
    lastUpdated: new Date(),
  };
}

const EMPTY_RATIOS: TreasuryRatios = {
  collateralization: Number.NaN,
  ustcPerUst1: Number.NaN,
  assetsToLiabilities: Number.NaN,
  totalAssetsUsd: Number.NaN,
  crAssetsUsd: Number.NaN,
  totalLiabilitiesUsd: Number.NaN,
  crLiabilitiesUsd: Number.NaN,
  incomplete: true,
  totalIncomplete: true,
  pricesReady: false,
  includedSymbols: [],
  missingPriceSymbols: [],
  ust1SupplyStatus: 'unknown',
  liabilityStatus: 'unknown',
  tier: null,
};

export function useTreasury() {
  const { prices, isLoading: pricesLoading } = usePrices();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['treasury', 'fullData'],
    queryFn: fetchTreasuryData,
    refetchInterval: POLLING_INTERVAL * 3,
    staleTime: POLLING_INTERVAL,
    placeholderData: (previousData) => previousData,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const treasuryData: TreasuryData | null = useMemo(() => {
    if (!data) return null;

    const assets: Record<string, TreasuryAsset> = { ...data.assets };
    const ratioAssets: RatioAssetInput[] = Object.values(data.assets).map((asset) => ({
      symbol: asset.displayName,
      balanceRaw: asset.balance,
      decimals: asset.decimals,
    }));

    const lpLegSets: LpNavLegInput[][] = [];
    for (const pos of data.lpPositions) {
      if (pos.lpBalance <= 0n && !pos.balanceUnknown) continue;

      const pricedLegs =
        pos.legs?.map((leg) => ({
          symbol: leg.symbol,
          amountRaw: leg.amountRaw,
          decimals: leg.decimals,
          kind: leg.kind,
          usd: resolveLpLegUsd(leg.kind, leg.symbol, prices),
        })) ?? null;
      if (pricedLegs) lpLegSets.push(pricedLegs);

      const nav =
        pos.queryFailed || !pricedLegs || pos.totalShare === null
          ? {
              displayUsd: null as number | null,
              crUsd: null as number | null,
              haircutLegs: [] as string[],
              missingPriceLegs: [] as string[],
              incomplete: true,
            }
          : computeLpNav({
              lpBalance: pos.lpBalance,
              totalShare: pos.totalShare,
              legs: pricedLegs,
            });

      if (pos.lpBalance > 0n) {
        assets[pos.symbol.toLowerCase()] = {
          denom: pos.lpAddress,
          balance: pos.lpBalance,
          decimals: pos.lpDecimals,
          displayName: pos.displayName,
          gradient: pos.gradient,
          iconColor: pos.iconColor,
          kind: 'lp',
          displayUsd: nav.displayUsd,
          crUsd: nav.crUsd,
          haircutLegs: nav.haircutLegs,
          missingPriceLegs: nav.missingPriceLegs,
          pairLabel: pos.pairLabel,
          pairSymbols: pos.pairSymbols,
          explorerAddress: pos.pairAddress,
          navIncomplete: nav.incomplete,
          poolShare:
            pos.totalShare !== null && pos.totalShare > 0n
              ? Number((pos.lpBalance * 1_000_000n) / pos.totalShare) / 1_000_000
              : null,
        };
      }

      if (pos.lpBalance > 0n || nav.crUsd === null) {
        ratioAssets.push({
          symbol: pos.displayName,
          balanceRaw: pos.lpBalance,
          decimals: pos.lpDecimals,
          crUsd: nav.crUsd,
          displayUsd: nav.displayUsd,
        });
      }
    }

    const ustrUsd = resolveUstrUsd(prices, lpLegSets);
    const protocolIds: ProtocolTokenId[] = ['ust1', 'ustr', 'cLunc', 'cUstc'];
    for (const id of protocolIds) {
      const meta = PROTOCOL_HOLDING_META[id];
      const spot = data.protocolSpot[id];
      const displayUsd = protocolHoldingUsd(id, spot, prices, ustrUsd);
      if (spot !== null && spot > 0n) {
        assets[meta.displayName.toLowerCase()] = {
          denom: meta.address,
          balance: spot,
          decimals: meta.decimals,
          displayName: meta.displayName,
          gradient: meta.gradient,
          iconColor: meta.iconColor,
          kind: 'spot',
          protocolIssued: true,
          displayUsd,
          crUsd: 0,
          haircutLegs: [meta.displayName],
          explorerAddress: meta.address,
        };
      }
      if (spot === null || spot > 0n) {
        ratioAssets.push({
          symbol: meta.displayName,
          balanceRaw: spot ?? 0n,
          decimals: meta.decimals,
          crUsd: 0,
          displayUsd,
        });
      }
    }

    const ust1Available = data.ust1Issuance.inventoryKnown
      ? data.ust1Issuance.availableSupply
      : null;

    const liabilityOf = (
      label: string,
      issuance: TokenIssuance | null,
      id: ProtocolTokenId,
      decimals: number
    ): ProtocolLiabilityInput => {
      if (issuance === null) {
        return {
          label,
          outstandingRaw: null,
          availableRaw: null,
          inventoryKnown: false,
          decimals,
          usd: protocolTokenUnitUsd(id, prices, ustrUsd),
        };
      }
      return {
        label,
        outstandingRaw: issuance.outstanding,
        availableRaw: issuance.inventoryKnown ? issuance.availableSupply : null,
        inventoryKnown: issuance.inventoryKnown,
        decimals,
        usd: protocolTokenUnitUsd(id, prices, ustrUsd),
      };
    };

    const computed = computeTreasuryRatios({
      ust1AvailableRaw: ust1Available,
      ust1Decimals: 6,
      ustcBalanceRaw: data.assets.ustc?.balance ?? 0n,
      ustcDecimals: data.assets.ustc?.decimals ?? 6,
      assets: ratioAssets,
      prices,
      liabilities: [
        liabilityOf('UST1', data.ust1Issuance, 'ust1', 6),
        liabilityOf('USTR', data.ustrIssuance, 'ustr', 18),
        liabilityOf('cLUNC', data.cLuncIssuance, 'cLunc', 6),
        liabilityOf('cUSTC', data.cUstcIssuance, 'cUstc', 6),
      ],
    });

    const ratios = pricesLoading
      ? { ...computed, pricesReady: false, tier: null }
      : computed;

    return {
      assets,
      ust1Issuance: data.ust1Issuance,
      ustrIssuance: data.ustrIssuance,
      cLuncIssuance: data.cLuncIssuance,
      cUstcIssuance: data.cUstcIssuance,
      ratios,
      lastUpdated: data.lastUpdated,
    };
  }, [data, prices, pricesLoading]);

  return {
    treasuryData,
    isLoading: isLoading && !data,
    isFetching,
    error: error && !data ? (error as Error).message : null,
    refetch,
  };
}

export { EMPTY_RATIOS };
