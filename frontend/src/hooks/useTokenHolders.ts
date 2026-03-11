import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { contractService } from '../services/contract';
import type { HolderCountResponse } from '../types/contracts';
import { POLLING_INTERVAL } from '../utils/constants';

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

  const staleTime = verifyBalances
    ? POLLING_INTERVAL * 30
    : POLLING_INTERVAL * 60;

  const refetchInterval = verifyBalances
    ? POLLING_INTERVAL * 60
    : POLLING_INTERVAL * 120;

  return useQuery<string[], Error>({
    queryKey: ['tokenHolders', tokenAddress, verifyBalances],
    queryFn: () => contractService.getAllTokenAccounts(tokenAddress!, undefined, verifyBalances),
    enabled: !!tokenAddress && enabled,
    staleTime,
    refetchInterval,
  });
}

export function useTokenHoldersCount(
  tokenAddress: string | undefined,
  options: HolderOptions = {}
): UseQueryResult<HolderCountResponse, Error> {
  const { enabled = true, verifyBalances = true } = options;

  const staleTime = verifyBalances 
    ? POLLING_INTERVAL * 30
    : POLLING_INTERVAL * 60;
  
  const refetchInterval = verifyBalances
    ? POLLING_INTERVAL * 60
    : POLLING_INTERVAL * 120;

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
    staleTime: POLLING_INTERVAL,
  });
}
