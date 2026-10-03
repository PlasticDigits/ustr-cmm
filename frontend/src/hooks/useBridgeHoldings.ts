/**
 * BSC lock/unlock USDT and CL8Y balances.
 * Polled on its own query key so a public-RPC failure cannot blank treasury
 * reserves or CMM ratios.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchBridgeHoldings } from '../services/bridgeHoldings';
import { POLLING_INTERVAL } from '../utils/constants';
import type { BridgeHoldings } from '../types/bridge';

const BRIDGE_POLL_MS = POLLING_INTERVAL * 6;

export function useBridgeHoldings(): {
  holdings: BridgeHoldings | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ['treasury', 'bridgeHoldings'],
    queryFn: () => fetchBridgeHoldings(),
    refetchInterval: BRIDGE_POLL_MS,
    staleTime: POLLING_INTERVAL * 3,
    placeholderData: (previous) => previous,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    holdings: query.data ?? null,
    isLoading: query.isLoading && !query.data,
  };
}
