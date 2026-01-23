/**
 * useTokenStats Hook
 * 
 * Fetches token statistics including holder count
 */

import { useQuery } from '@tanstack/react-query';
import { contractService } from '../services/contract';
import { CONTRACTS, DEFAULT_NETWORK } from '../utils/constants';
import { POLLING_INTERVAL } from '../utils/constants';

export function useTokenStats() {
  const contracts = CONTRACTS[DEFAULT_NETWORK];
  const ustrTokenAddress = contracts.ustrToken;

  // Query holder count
  const { data: holderCount, isLoading: isLoadingHolderCount } = useQuery({
    queryKey: ['tokenHolderCount', ustrTokenAddress],
    queryFn: () => contractService.getTokenHolderCount(ustrTokenAddress),
    enabled: !!ustrTokenAddress,
    refetchInterval: POLLING_INTERVAL * 6, // Refresh every 60 seconds (less frequent since it's expensive)
    staleTime: POLLING_INTERVAL * 3, // Consider stale after 30 seconds
    retry: 2, // Retry up to 2 times on failure
  });

  // Query token info
  const { data: tokenInfo, isLoading: isLoadingTokenInfo } = useQuery({
    queryKey: ['tokenInfo', ustrTokenAddress],
    queryFn: () => contractService.getTokenInfo(ustrTokenAddress),
    enabled: !!ustrTokenAddress,
    refetchInterval: POLLING_INTERVAL * 3, // Refresh every 30 seconds
    staleTime: POLLING_INTERVAL,
  });

  return {
    holderCount: holderCount ?? 0,
    tokenInfo,
    isLoading: isLoadingHolderCount || isLoadingTokenInfo,
  };
}
