import { useEffect } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { contractService } from '../services/contract';
import type { HolderCountResponse } from '../types/contracts';
import { CW20_ENUM, POLLING_INTERVAL } from '../utils/constants';

interface BaseOptions {
  enabled?: boolean;
}

interface HolderOptions extends BaseOptions {
  verifyBalances?: boolean;
}

export function useTokenHolders(
  tokenAddress: string | undefined,
  options: HolderOptions = {}
): UseQueryResult<string[], Error> {
  const { enabled = true, verifyBalances = true } = options;

  const query = useQuery<string[], Error>({
    queryKey: ['tokenHolders', tokenAddress, verifyBalances],
    queryFn: () => contractService.getAllTokenAccounts(tokenAddress!, undefined, verifyBalances),
    enabled: !!tokenAddress && enabled,
    staleTime: POLLING_INTERVAL,
    refetchInterval: POLLING_INTERVAL * 3,
  });

  useEffect(() => {
    return () => {
      // Nothing special to clean up, but kept for potential AbortController wiring
    };
  }, []);

  return query;
}

export function useTokenHoldersCount(
  tokenAddress: string | undefined,
  options: HolderOptions = {}
): UseQueryResult<HolderCountResponse, Error> {
  const { enabled = true, verifyBalances = true } = options;

  // Optimize caching: holder counts don't change frequently
  // - Longer staleTime for fast dashboard loads (5 minutes)
  // - Longer refetchInterval to reduce unnecessary recomputation (10 minutes)
  // - If verifyBalances is false, it's even cheaper, so we can cache longer
  const staleTime = verifyBalances 
    ? POLLING_INTERVAL * 30  // 5 minutes for verified (more expensive)
    : POLLING_INTERVAL * 60; // 10 minutes for enumerated (cheaper)
  
  const refetchInterval = verifyBalances
    ? POLLING_INTERVAL * 60  // 10 minutes for verified
    : POLLING_INTERVAL * 120; // 20 minutes for enumerated

  return useQuery<HolderCountResponse, Error>({
    queryKey: ['tokenHoldersCount', tokenAddress, verifyBalances],
    queryFn: () => contractService.getTokenHoldersCount(tokenAddress!, undefined, verifyBalances),
    enabled: !!tokenAddress && enabled,
    staleTime,
    refetchInterval,
  });
}

export function useTokenAccounts(
  tokenAddress: string | undefined,
  options: BaseOptions = {}
): UseQueryResult<string[], Error> {
  const { enabled = true } = options;

  return useQuery<string[], Error>({
    queryKey: ['tokenAccounts', tokenAddress],
    queryFn: () => contractService.getAllTokenAccounts(tokenAddress!, undefined, false),
    enabled: !!tokenAddress && enabled,
    staleTime: CW20_ENUM.PAGINATION_DELAY * 10 || POLLING_INTERVAL,
  });
}

