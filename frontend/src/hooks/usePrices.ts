import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { priceService } from '../services/price';
import { PRICE_CACHE } from '../utils/constants';
import { isVfdusdToken } from '../utils/oracleTokens';
import { fetchTokenList } from '../utils/tokenlist';
import { isLpTokenListEntry } from '../types/tokenlist';

/**
 * usePrices Hook
 * 
 * Fetches and caches token prices from CEX and DEX with fallback chain.
 * Dynamically reads token addresses from tokenlist.json.
 * 
 * @returns Object containing prices, LUNC/USTC prices, loading state, error, and refetch function
 */
export function usePrices(): {
  prices: Record<string, number>;
  luncUsd: number;
  ustcUsd: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  // Ref to store last successful prices for fallback
  const lastPricesRef = useRef<Record<string, number>>({});

  // Fetch base prices (LUNC, USTC) from Binance
  const baseQuery = useQuery({
    queryKey: ['prices', 'base'],
    queryFn: () => priceService.fetchBasePrices(),
    staleTime: PRICE_CACHE.staleTime,
    refetchInterval: PRICE_CACHE.basePrices,
    // Keep previous data to prevent flickering when refetch fails
    placeholderData: (prev) => prev,
  });

  // Fetch token prices for all CW20 tokens in tokenlist
  const tokensQuery = useQuery({
    queryKey: ['prices', 'tokens', baseQuery.data?.lunc, baseQuery.data?.ustc],
    queryFn: async () => {
      const basePrices = baseQuery.data!;
      // Start with previous prices as fallback
      const prices: Record<string, number> = { ...lastPricesRef.current };

      // Only overwrite LUNC/USTC when we got a real price — never wipe a good
      // cached value with 0 (CEX blips used to blank LUNC while CW20s kept stale USD).
      if (basePrices.lunc > 0) {
        prices['LUNC'] = basePrices.lunc;
      }
      if (basePrices.ustc > 0) {
        prices['USTC'] = basePrices.ustc;
      }

      // Fetch tokenlist to get all CW20 tokens
      const tokenList = await fetchTokenList();
      // Spot CW20s only — never simulate-swap an LP mint (#14)
      const cw20Tokens = tokenList.tokens.filter(
        (t) => t.type === 'cw20' && t.address && !isLpTokenListEntry(t)
      );

      // Fetch prices for each CW20 token (vFDUSD is oracle-only — never DEX simulate)
      for (const token of cw20Tokens) {
        if (isVfdusdToken(token.symbol, token.address)) {
          continue;
        }
        // Pass pool config if available for direct querying
        const pool = token.pool ? { address: token.pool.address, dex: token.pool.dex, quoteAsset: token.pool.quoteAsset } : undefined;
        const price = await priceService.getTokenPriceUsd(token.address!, basePrices.lunc, basePrices.ustc, pool);
        // Only update price if we got a valid positive response
        // null means query failed - we preserve the previous price from lastPricesRef
        // 0 means DEX returned a quote but base USD was missing - also preserve previous
        if (price !== null && price > 0) {
          prices[token.symbol] = price;
        }
        // If price is null/0 and we have a previous price, it's already in prices from spread
      }

      // Update the ref with latest successful prices
      lastPricesRef.current = prices;

      return prices;
    },
    staleTime: PRICE_CACHE.staleTime,
    // Only run when base prices are available
    enabled: baseQuery.isSuccess && !!baseQuery.data,
    // Keep previous data to prevent flickering when refetch fails
    placeholderData: (prev) => prev,
  });

  // Session-once oracle USD for vFDUSD — no interval, no window-focus refetch
  const vfdusdQuery = useQuery({
    queryKey: ['prices', 'vfdusd-oracle'],
    queryFn: () => priceService.getVfdusdUsdSessionOnce(),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: false,
  });

  const prices: Record<string, number> = { ...(tokensQuery.data ?? {}) };
  if (vfdusdQuery.data !== undefined && vfdusdQuery.data !== null && vfdusdQuery.data > 0) {
    prices['vFDUSD'] = vfdusdQuery.data;
  }

  // Determine loading state (true if either query is loading)
  const isLoading = baseQuery.isLoading || tokensQuery.isLoading;

  // Determine error state (true if either query has error)
  const error = baseQuery.error
    ? `Base prices error: ${(baseQuery.error as Error).message}`
    : tokensQuery.error
    ? `Token prices error: ${(tokensQuery.error as Error).message}`
    : null;

  return {
    prices,
    luncUsd:
      baseQuery.data?.lunc && baseQuery.data.lunc > 0
        ? baseQuery.data.lunc
        : prices['LUNC'] ?? 0,
    ustcUsd:
      baseQuery.data?.ustc && baseQuery.data.ustc > 0
        ? baseQuery.data.ustc
        : prices['USTC'] ?? 0,
    isLoading,
    error,
    refetch: () => {
      baseQuery.refetch();
      tokensQuery.refetch();
    },
  };
}