/**
 * useContract Hook
 * 
 * Generic hook for querying contract data with caching and auto-refresh.
 * Uses React Query for data fetching and caching.
 */

import { useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { contractService } from '../services/contract';
import { POLLING_INTERVAL } from '../utils/constants';

// ============================================
// Treasury Queries
// ============================================

export function useTreasuryConfig() {
  return useQuery({
    queryKey: ['treasuryConfig'],
    queryFn: () => contractService.getTreasuryConfig(),
    staleTime: POLLING_INTERVAL * 6, // Config rarely changes
  });
}

export function useTreasuryBalances() {
  return useQuery({
    queryKey: ['treasuryBalances'],
    queryFn: () => contractService.getTreasuryBalances(),
    refetchInterval: POLLING_INTERVAL * 3,
    staleTime: POLLING_INTERVAL,
  });
}

export function useTreasuryUstcBalance() {
  return useQuery({
    queryKey: ['treasuryUstcBalance'],
    queryFn: () => contractService.getTreasuryUstcBalance(),
    refetchInterval: POLLING_INTERVAL * 3,
    staleTime: POLLING_INTERVAL,
  });
}

// ============================================
// Token Queries
// ============================================

export function useTokenInfo(tokenAddress: string | undefined) {
  return useQuery({
    queryKey: ['tokenInfo', tokenAddress],
    queryFn: () => contractService.getTokenInfo(tokenAddress!),
    enabled: !!tokenAddress,
    staleTime: Infinity, // Token info never changes
  });
}

export function useTokenBalance(
  tokenAddress: string | undefined,
  walletAddress: string | undefined
) {
  return useQuery({
    queryKey: ['tokenBalance', tokenAddress, walletAddress],
    queryFn: () => contractService.getTokenBalance(tokenAddress!, walletAddress!),
    enabled: !!tokenAddress && !!walletAddress,
    refetchInterval: POLLING_INTERVAL,
    staleTime: POLLING_INTERVAL / 2,
  });
}

export function useNativeBalance(
  walletAddress: string | undefined,
  denom: string = 'uusd'
) {
  return useQuery({
    queryKey: ['nativeBalance', walletAddress, denom],
    queryFn: () => contractService.getNativeBalance(walletAddress!, denom),
    enabled: !!walletAddress,
    refetchInterval: POLLING_INTERVAL,
    staleTime: POLLING_INTERVAL / 2,
  });
}

// ============================================
// Swap Queries
// ============================================

export function useSwapConfig() {
  return useQuery({
    queryKey: ['swapConfig'],
    queryFn: () => contractService.getSwapConfig(),
    staleTime: POLLING_INTERVAL * 6,
  });
}

// ============================================
// Custom Query Hook Factory
// ============================================

interface ContractQueryOptions<T> extends Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> {
  queryKey: string[];
  queryFn: () => Promise<T>;
  autoRefresh?: boolean;
}

export function useContractQuery<T>({
  queryKey,
  queryFn,
  autoRefresh = false,
  ...options
}: ContractQueryOptions<T>) {
  return useQuery({
    queryKey,
    queryFn,
    refetchInterval: autoRefresh ? POLLING_INTERVAL : undefined,
    staleTime: autoRefresh ? POLLING_INTERVAL / 2 : POLLING_INTERVAL * 6,
    ...options,
  });
}

// ============================================
// Invalidation Helpers
// ============================================

export function useInvalidateQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => queryClient.invalidateQueries(),
    invalidateSwap: () => queryClient.invalidateQueries({ queryKey: ['swap'] }),
    invalidateTreasury: () => queryClient.invalidateQueries({ queryKey: ['treasury'] }),
    invalidateBalances: () => queryClient.invalidateQueries({ queryKey: ['balance'] }),
  };
}

