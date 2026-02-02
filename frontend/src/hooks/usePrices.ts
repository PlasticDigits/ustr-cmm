import { useQuery } from '@tanstack/react-query';
import { priceService } from '../services/price';
import { PRICE_CACHE } from '../utils/constants';

/**
 * Known token address to symbol mapping
 */
const TOKEN_ADDRESS_TO_SYMBOL: Record<string, string> = {
  'terra1x6e64es6yhauhvs3prvpdg2gkqdtfru840wgnhs935x8axr7zxkqzysuxz': 'ALPHA',
};

/**
 * Default token addresses to fetch prices for
 */
const DEFAULT_TOKEN_ADDRESSES = Object.keys(TOKEN_ADDRESS_TO_SYMBOL);

/**
 * usePrices Hook
 * 
 * Fetches and caches token prices from CEX and DEX with fallback chain.
 * 
 * @param tokenAddresses - Optional array of CW20 token addresses to fetch prices for
 * @returns Object containing prices, LUNC/USTC prices, loading state, error, and refetch function
 */
export function usePrices(tokenAddresses?: string[]): {
  prices: Record<string, number>;
  luncUsd: number;
  ustcUsd: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  // Use provided addresses or default to known tokens
  const addresses = tokenAddresses ?? DEFAULT_TOKEN_ADDRESSES;

  // Fetch base prices (LUNC, USTC) from Binance
  const baseQuery = useQuery({
    queryKey: ['prices', 'base'],
    queryFn: () => priceService.fetchBasePrices(),
    staleTime: PRICE_CACHE.staleTime,
    refetchInterval: PRICE_CACHE.basePrices,
  });

  // Fetch token prices for each address (waits for base prices to load first)
  const tokensQuery = useQuery({
    queryKey: ['prices', 'tokens', baseQuery.data?.lunc, baseQuery.data?.ustc, ...addresses],
    queryFn: async () => {
      const basePrices = baseQuery.data!;
      const prices: Record<string, number> = {};

      // Include LUNC and USTC in prices
      prices['LUNC'] = basePrices.lunc;
      prices['USTC'] = basePrices.ustc;

      // Fetch prices for each token address
      for (const address of addresses) {
        const price = await priceService.getTokenPriceUsd(address, basePrices.lunc);
        
        // Map address to symbol using known mapping
        const symbol = TOKEN_ADDRESS_TO_SYMBOL[address] ?? address.slice(0, 10);
        prices[symbol] = price ?? 0;
      }

      return prices;
    },
    staleTime: PRICE_CACHE.staleTime,
    // Only run when base prices are available
    enabled: addresses.length > 0 && baseQuery.isSuccess && !!baseQuery.data,
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