/**
 * useTreasury Hook
 * 
 * Fetches treasury data from on-chain using tokenlist.json for metadata:
 * - Treasury's native balances (USTC, etc.)
 * - Treasury's CW20 balances (ALPHA, etc.)
 * - USTR total supply
 * - Calculated ratios
 */

import { useQuery } from '@tanstack/react-query';
import { contractService } from '../services/contract';
import { CONTRACTS, DEFAULT_NETWORK, DECIMALS, POLLING_INTERVAL, TOKEN_LIST_URL } from '../utils/constants';
import type { TreasuryData, TreasuryAsset } from '../types/treasury';

const contracts = CONTRACTS[DEFAULT_NETWORK];

/** Token metadata from tokenlist.json */
interface TokenListEntry {
  symbol: string;
  name: string;
  denom?: string;      // For native tokens
  address?: string;    // For CW20 tokens
  type: 'native' | 'cw20';
  decimals: number;
  gradient: string;
  iconColor: string;
}

interface TokenList {
  name: string;
  version: string;
  tokens: TokenListEntry[];
  treasuryAssets: string[];  // Symbols of assets to show in treasury
}

/** Cached token list */
let tokenListCache: TokenList | null = null;

/**
 * Fetch token list from public assets
 */
async function fetchTokenList(): Promise<TokenList> {
  if (tokenListCache) {
    return tokenListCache;
  }
  
  const response = await fetch(TOKEN_LIST_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch token list: ${response.status}`);
  }
  
  tokenListCache = await response.json();
  return tokenListCache!;
}

/**
 * Fetch treasury data from chain
 */
async function fetchTreasuryData(): Promise<TreasuryData> {
  // Load token list for metadata
  const tokenList = await fetchTokenList();
  const tokenMap = new Map(tokenList.tokens.map(t => [t.symbol, t]));
  
  const assets: Record<string, TreasuryAsset> = {};
  
  // Fetch balances for each treasury asset defined in tokenlist
  for (const symbol of tokenList.treasuryAssets) {
    const token = tokenMap.get(symbol);
    if (!token) {
      console.warn(`Token ${symbol} not found in tokenlist`);
      continue;
    }
    
    try {
      let balance = BigInt(0);
      
      if (token.type === 'native' && token.denom) {
        // Native token - query bank balance
        const balanceStr = await contractService.getNativeBalance(contracts.treasury, token.denom);
        balance = BigInt(balanceStr || '0');
      } else if (token.type === 'cw20' && token.address) {
        // CW20 token - query token contract
        const result = await contractService.getTokenBalance(token.address, contracts.treasury);
        balance = BigInt(result.balance || '0');
      }
      
      assets[symbol.toLowerCase()] = {
        denom: token.denom || token.address || symbol.toLowerCase(),
        balance,
        decimals: token.decimals,
        displayName: symbol,
        gradient: token.gradient,
        iconColor: token.iconColor,
      };
    } catch (error) {
      console.error(`Failed to fetch ${symbol} balance:`, error);
    }
  }
  
  // Get USTR token info (total supply)
  let ustrTotalSupply = BigInt(0);
  const ustrToken = tokenMap.get('USTR');
  try {
    const ustrTokenInfo = await contractService.getTokenInfo(contracts.ustrToken);
    ustrTotalSupply = BigInt(ustrTokenInfo.total_supply || '0');
  } catch (error) {
    console.error('Failed to fetch USTR token info:', error);
  }
  
  // Calculate USTR backing ratio
  // USTR backing = USTC balance / USTR supply (in comparable units)
  let ustrBacking = 0;
  const ustcAsset = assets.ustc;
  if (ustrTotalSupply > 0n && ustcAsset) {
    // Convert USTC to comparable decimals (6 -> 18)
    const ustrDecimals = ustrToken?.decimals || DECIMALS.USTR;
    const ustcInUstrDecimals = ustcAsset.balance * BigInt(10 ** (ustrDecimals - ustcAsset.decimals));
    ustrBacking = Number(ustcInUstrDecimals * 100n / ustrTotalSupply) / 100;
  }
  
  // When UST1 supply is 0, ratios that divide by liabilities are infinite
  // (assets / 0 liabilities = infinite collateralization)
  const ust1Supply = BigInt(0); // Currently no UST1 issued
  const hasUst1Issued = ust1Supply > 0n;
  
  return {
    assets,
    ust1Issuance: {
      minted: BigInt(0),
      burned: BigInt(0),
      supply: ust1Supply,
    },
    ustrIssuance: {
      minted: ustrTotalSupply,
      burned: BigInt(0), // Currently 0, no burn mechanism yet
      supply: ustrTotalSupply,
    },
    ratios: {
      // With no UST1 liabilities, collateralization is infinite
      collateralization: hasUst1Issued ? 0 : Infinity,
      // USTC backing per UST1 is infinite when no UST1 exists
      ustcPerUst1: hasUst1Issued ? 0 : Infinity,
      // Assets / Liabilities is infinite when liabilities = 0
      assetsToLiabilities: hasUst1Issued ? 0 : Infinity,
      ustrBacking,
    },
    lastUpdated: new Date(),
  };
}

export function useTreasury() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['treasury', 'fullData'],
    queryFn: fetchTreasuryData,
    refetchInterval: POLLING_INTERVAL * 3, // Every 30 seconds
    staleTime: POLLING_INTERVAL,
    // Keep previous data while refetching to prevent UI flickering
    placeholderData: (previousData) => previousData,
    // Don't retry at React Query level - contract service handles fallbacks
    retry: false,
    // Don't refetch on window focus to reduce unnecessary requests
    refetchOnWindowFocus: false,
  });

  return {
    treasuryData: data ?? null,
    isLoading: isLoading && !data, // Only show loading if no data at all
    isFetching, // True when refetching in background
    error: error && !data ? (error as Error).message : null, // Only show error if no data
    refetch,
  };
}
