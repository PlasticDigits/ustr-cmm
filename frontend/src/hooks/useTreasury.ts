/**
 * useTreasury Hook
 *
 * Fetches treasury holdings from tokenlist.json plus UST1 / wrap-token supplies.
 * Key ratios use UST1 circulating (CW20 total_supply) as the liability denominator (#11).
 * Allowlisted `type: "lp"` rows use reserve NAV; wrap legs are haircut from CR (#14).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { contractService } from '../services/contract';
import { fetchTreasuryLpPositions, type LpChainPosition } from '../services/treasuryLp';
import { CONTRACTS, DEFAULT_NETWORK, POLLING_INTERVAL } from '../utils/constants';
import { isTerraContractAddress } from '../utils/addresses';
import { isRawProtocolHolding, resolveLpLegUsd } from '../utils/lpEligibility';
import { computeLpNav } from '../utils/lpNav';
import { fetchTokenList } from '../utils/tokenlist';
import { computeTreasuryRatios, type RatioAssetInput } from '../utils/treasuryRatios';
import { isLpTokenListEntry } from '../types/tokenlist';
import type { TreasuryData, TreasuryAsset, TokenIssuance, TreasuryRatios } from '../types/treasury';
import { usePrices } from './usePrices';

const contracts = CONTRACTS[DEFAULT_NETWORK];

interface TreasuryChainData {
  assets: Record<string, TreasuryAsset>;
  lpPositions: LpChainPosition[];
  ust1Issuance: TokenIssuance;
  ustrIssuance: TokenIssuance;
  cLuncIssuance: TokenIssuance | null;
  cUstcIssuance: TokenIssuance | null;
  issuanceLifetimeUnknown: boolean;
  ust1SupplyRaw: bigint | null;
  ustrBacking: number;
  lastUpdated: Date;
}

function supplyOnlyIssuance(totalSupply: bigint): TokenIssuance {
  // CW20-mintable / window have no lifetime mint/burn counters.
  // minted = supply, burned = 0 so minted - burned === supply, with UI disclaimer.
  return {
    minted: totalSupply,
    burned: 0n,
    supply: totalSupply,
  };
}

async function fetchSupplyIssuance(address: string): Promise<TokenIssuance> {
  const info = await contractService.getTokenInfoStrict(address);
  return supplyOnlyIssuance(BigInt(info.total_supply || '0'));
}

async function fetchTreasuryData(): Promise<TreasuryChainData> {
  const tokenList = await fetchTokenList();
  const tokenMap = new Map(tokenList.tokens.map((t) => [t.symbol, t]));

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

  let ustrTotalSupply = BigInt(0);
  const ustrToken = tokenMap.get('USTR');
  try {
    const ustrTokenInfo = await contractService.getTokenInfo(contracts.ustrToken);
    ustrTotalSupply = BigInt(ustrTokenInfo.total_supply || '0');
  } catch (error) {
    console.error('Failed to fetch USTR token info:', error);
  }

  let ustrBacking = 0;
  const ustcAsset = assets.ustc;
  if (ustrTotalSupply > 0n && ustcAsset) {
    const ustrDecimals = ustrToken?.decimals || 18;
    const ustcInUstrDecimals = ustcAsset.balance * BigInt(10 ** (ustrDecimals - ustcAsset.decimals));
    ustrBacking = Number(ustcInUstrDecimals * 100n / ustrTotalSupply) / 100;
  }

  let ust1Issuance: TokenIssuance = { minted: 0n, burned: 0n, supply: 0n };
  let ust1SupplyRaw: bigint | null = null;
  if (isTerraContractAddress(contracts.ust1Token)) {
    try {
      ust1Issuance = await fetchSupplyIssuance(contracts.ust1Token);
      ust1SupplyRaw = ust1Issuance.supply;
    } catch (error) {
      console.error('Failed to fetch UST1 token info:', error);
      ust1SupplyRaw = null;
    }
  }

  let cLuncIssuance: TokenIssuance | null = null;
  if (isTerraContractAddress(contracts.cLunc)) {
    try {
      cLuncIssuance = await fetchSupplyIssuance(contracts.cLunc);
    } catch (error) {
      console.error('Failed to fetch cLUNC token info:', error);
    }
  }

  let cUstcIssuance: TokenIssuance | null = null;
  if (isTerraContractAddress(contracts.cUstc)) {
    try {
      cUstcIssuance = await fetchSupplyIssuance(contracts.cUstc);
    } catch (error) {
      console.error('Failed to fetch cUSTC token info:', error);
    }
  }

  return {
    assets,
    lpPositions,
    ust1Issuance,
    ustrIssuance: {
      minted: ustrTotalSupply,
      burned: 0n,
      supply: ustrTotalSupply,
    },
    cLuncIssuance,
    cUstcIssuance,
    issuanceLifetimeUnknown: true,
    ust1SupplyRaw,
    ustrBacking,
    lastUpdated: new Date(),
  };
}

const EMPTY_RATIOS: TreasuryRatios = {
  collateralization: Number.NaN,
  ustcPerUst1: Number.NaN,
  assetsToLiabilities: Number.NaN,
  ustrBacking: 0,
  incomplete: true,
  includedSymbols: [],
  missingPriceSymbols: [],
  ust1SupplyStatus: 'unknown',
};

export function useTreasury() {
  const { prices } = usePrices();

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

    for (const pos of data.lpPositions) {
      if (pos.lpBalance <= 0n) continue;

      const nav =
        pos.queryFailed || !pos.legs || pos.totalShare === null
          ? {
              displayUsd: null as number | null,
              crUsd: null as number | null,
              haircutLegs: [] as string[],
              incomplete: true,
            }
          : computeLpNav({
              lpBalance: pos.lpBalance,
              totalShare: pos.totalShare,
              legs: pos.legs.map((leg) => ({
                symbol: leg.symbol,
                amountRaw: leg.amountRaw,
                decimals: leg.decimals,
                kind: leg.kind,
                usd: resolveLpLegUsd(leg.kind, leg.symbol, prices),
              })),
            });

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
        pairLabel: pos.pairLabel,
        pairSymbols: pos.pairSymbols,
        explorerAddress: pos.pairAddress,
        navIncomplete: nav.incomplete,
        poolShare:
          pos.totalShare !== null && pos.totalShare > 0n
            ? Number((pos.lpBalance * 1_000_000n) / pos.totalShare) / 1_000_000
            : null,
      };

      ratioAssets.push({
        symbol: pos.displayName,
        balanceRaw: pos.lpBalance,
        decimals: pos.lpDecimals,
        crUsd: nav.crUsd,
      });
    }

    const ratios = computeTreasuryRatios({
      ust1SupplyRaw: data.ust1SupplyRaw,
      ust1Decimals: 6,
      ustcBalanceRaw: data.assets.ustc?.balance ?? 0n,
      ustcDecimals: data.assets.ustc?.decimals ?? 6,
      assets: ratioAssets,
      prices,
      ustrBacking: data.ustrBacking,
    });

    return {
      assets,
      ust1Issuance: data.ust1Issuance,
      ustrIssuance: data.ustrIssuance,
      cLuncIssuance: data.cLuncIssuance,
      cUstcIssuance: data.cUstcIssuance,
      issuanceLifetimeUnknown: data.issuanceLifetimeUnknown,
      ratios,
      lastUpdated: data.lastUpdated,
    };
  }, [data, prices]);

  return {
    treasuryData,
    isLoading: isLoading && !data,
    isFetching,
    error: error && !data ? (error as Error).message : null,
    refetch,
  };
}

export { EMPTY_RATIOS };
