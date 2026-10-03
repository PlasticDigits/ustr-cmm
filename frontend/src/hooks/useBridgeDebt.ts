/**
 * Bridge-Debt markets from the columbus-5 issuer.
 * A failed read is an uncertified snapshot so ratios do not treat the borrow as zero.
 * BSC lock balances stay on useBridgeHoldings and are not merged here.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchBridgeDebts } from '../services/bridgeDebt';
import { BRIDGE, POLLING_INTERVAL } from '../utils/constants';
import type { BridgeDebtSnapshot } from '../types/bridge';

const BRIDGE_DEBT_POLL_MS = POLLING_INTERVAL * 6;

export function useBridgeDebt(): {
  snapshot: BridgeDebtSnapshot | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ['treasury', 'bridgeDebt'],
    queryFn: () => fetchBridgeDebts(),
    refetchInterval: BRIDGE_DEBT_POLL_MS,
    staleTime: POLLING_INTERVAL * 3,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isLoading = query.isLoading && query.data === undefined;
  const snapshot: BridgeDebtSnapshot | null = query.isError
    ? { issuer: BRIDGE.debtIssuer, markets: null }
    : (query.data ?? null);

  return { snapshot, isLoading };
}
