/**
 * useSwap Hook
 * 
 * Handles USTC to USTR swap functionality including:
 * - Rate queries and simulation
 * - Swap execution
 * - Status tracking
 * - Referral code handling
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contractService } from '../services/contract';
import { useWallet } from './useWallet';
import { POLLING_INTERVAL, SWAP_CONFIG } from '../utils/constants';
import type { SwapSimulation } from '../types/contracts';

export function useSwap() {
  const { address, connected, refreshBalances } = useWallet();
  const queryClient = useQueryClient();
  
  const [inputAmount, setInputAmount] = useState<string>('');
  const [referralCode, setReferralCode] = useState<string>('');
  const [simulation, setSimulation] = useState<SwapSimulation | null>(null);

  // Query current swap rate
  const { data: currentRate, isLoading: rateLoading } = useQuery({
    queryKey: ['swapRate'],
    queryFn: () => contractService.getCurrentRate(),
    refetchInterval: POLLING_INTERVAL,
    staleTime: POLLING_INTERVAL / 2,
  });

  // Query swap status
  const { data: swapStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['swapStatus'],
    queryFn: () => contractService.getSwapStatus(),
    refetchInterval: POLLING_INTERVAL,
    staleTime: POLLING_INTERVAL / 2,
  });

  // Query swap stats
  const { data: swapStats } = useQuery({
    queryKey: ['swapStats'],
    queryFn: () => contractService.getSwapStats(),
    refetchInterval: POLLING_INTERVAL * 3, // Less frequent
    staleTime: POLLING_INTERVAL,
  });

  // Simulate swap when input or referral code changes
  useEffect(() => {
    const simulateSwap = async () => {
      if (!inputAmount || parseFloat(inputAmount) <= 0) {
        setSimulation(null);
        return;
      }

      try {
        // Convert to micro units (6 decimals)
        const microAmount = Math.floor(parseFloat(inputAmount) * 1_000_000).toString();
        const result = await contractService.simulateSwap(microAmount, referralCode || undefined);
        setSimulation(result);
      } catch (error) {
        console.error('Simulation failed:', error);
        setSimulation(null);
      }
    };

    const debounce = setTimeout(simulateSwap, 300);
    return () => clearTimeout(debounce);
  }, [inputAmount, referralCode]);

  // Execute swap mutation
  const swapMutation = useMutation({
    mutationFn: async (ustcAmount: string) => {
      if (!address) throw new Error('Wallet not connected');
      
      // Convert to micro units
      const microAmount = Math.floor(parseFloat(ustcAmount) * 1_000_000).toString();
      
      // Compute leaderboard hint for O(1) insertion if using a referral code
      let leaderboardHint = undefined;
      if (referralCode && simulation?.bonus_amount) {
        // The referrer bonus is equal to the user bonus (10% each)
        // bonus_amount in simulation is the user's bonus, referrer gets the same
        const referrerBonus = simulation.bonus_amount;
        leaderboardHint = await contractService.computeLeaderboardHint(referralCode, referrerBonus);
        if (leaderboardHint) {
          console.log('📊 Leaderboard hint computed:', {
            code: referralCode,
            insertAfter: leaderboardHint.insert_after ?? '(new head)',
          });
        }
      }
      
      return contractService.executeSwap(address, microAmount, referralCode || undefined, leaderboardHint);
    },
    onSuccess: async () => {
      // Refresh all relevant data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['swapStats'] }),
        refreshBalances(),
      ]);
      
      // Clear input (but keep referral code)
      setInputAmount('');
      setSimulation(null);
    },
  });

  // Execute swap
  const executeSwap = useCallback(async () => {
    if (!inputAmount || !connected) return;
    await swapMutation.mutateAsync(inputAmount);
  }, [inputAmount, connected, swapMutation]);

  // Check if input exceeds max swap amount
  const exceedsMax = useCallback((): boolean => {
    if (!inputAmount) return false;
    return parseFloat(inputAmount) > SWAP_CONFIG.maxUstcPerSwap;
  }, [inputAmount]);

  // Check if swap is currently possible
  const canSwap = useCallback((): boolean => {
    if (!connected) return false;
    if (!swapStatus) return false;
    if (!swapStatus.started) return false;
    if (swapStatus.ended) return false;
    if (swapStatus.paused) return false;
    if (!inputAmount || parseFloat(inputAmount) < 1) return false; // Min 1 USTC
    if (parseFloat(inputAmount) > SWAP_CONFIG.maxUstcPerSwap) return false; // Max per swap
    return true;
  }, [connected, swapStatus, inputAmount]);

  return {
    // Input state
    inputAmount,
    setInputAmount,
    referralCode,
    setReferralCode,
    simulation,
    
    // Query data
    currentRate,
    swapStatus,
    swapStats,
    
    // Loading states
    isLoading: rateLoading || statusLoading,
    isSwapping: swapMutation.isPending,
    
    // Error state
    error: swapMutation.error,
    
    // Actions
    executeSwap,
    canSwap: canSwap(),
    
    // Computed values
    isActive: swapStatus?.started && !swapStatus?.ended && !swapStatus?.paused,
    timeRemaining: swapStatus?.seconds_until_end ?? 0,
    
    // Limits
    exceedsMax: exceedsMax(),
    maxUstcPerSwap: SWAP_CONFIG.maxUstcPerSwap,
  };
}

