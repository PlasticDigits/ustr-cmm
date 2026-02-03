import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { priceService } from '../services/price';
import { PRICE_CACHE, TOKEN_LIST_URL } from '../utils/constants';

/** Token entry from tokenlist.json */
interface TokenListEntry {
  symbol: string;
  address?: string;
  type: 'native' | 'cw20';
  pool?: {
    address: string;
    dex: string;
    name: string;
  };
}

/** Cached token list data */
let tokenListCache: { tokens: TokenListEntry[] } | null = null;

/** Fetch tokenlist for address-to-symbol mapping */
async function fetchTokenList(): Promise<{ tokens: TokenListEntry[] }> {
  if (tokenListCache) return tokenListCache;
  const response = await fetch(TOKEN_LIST_URL);
  if (!response.ok) throw new Error('Failed to fetch token list');
  tokenListCache = await response.json();
  return tokenListCache!;
}

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

      // Include LUNC and USTC in prices (always update from fresh data)
      prices['LUNC'] = basePrices.lunc;
      prices['USTC'] = basePrices.ustc;

      // Fetch tokenlist to get all CW20 tokens
      const tokenList = await fetchTokenList();
      const cw20Tokens = tokenList.tokens.filter(t => t.type === 'cw20' && t.address);

      // Fetch prices for each CW20 token
      for (const token of cw20Tokens) {
        // Pass pool address if available for direct querying
        const poolAddress = token.pool?.address;
        const price = await priceService.getTokenPriceUsd(token.address!, basePrices.lunc, poolAddress);
        // Only update price if we got a valid response
        // null means query failed - we preserve the previous price from lastPricesRef
        if (price !== null) {
          prices[token.symbol] = price;
        }
        // If price is null and we have a previous price, it's already in prices from spread
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

  // Determine loading state (true if either query is loading)
  const isLoading = baseQuery.isLoading || tokensQuery.isLoading;

  // Determine error state (true if either query has error)
  const error = baseQuery.error
    ? `Base prices error: ${(baseQuery.error as Error).message}`
    : tokensQuery.error
    ? `Token prices error: ${(tokensQuery.error as Error).message}`
    : null;

  return {
    prices: tokensQuery.data ?? {},
    luncUsd: baseQuery.data?.lunc ?? 0,
    ustcUsd: baseQuery.data?.ustc ?? 0,
    isLoading,
    error,
    refetch: () => {
      baseQuery.refetch();
      tokensQuery.refetch();
    },
  };
}