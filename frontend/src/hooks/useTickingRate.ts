/**
 * useTickingRate Hook
 * 
 * Provides a smoothly ticking rate that updates ~20 times per second.
 * Calculates elapsed time directly from the fixed launch date for accuracy.
 * 
 * Launch: January 22, 2026 13:00 UTC
 * Rate formula: rate = startRate + (endRate - startRate) * (elapsedSeconds / durationSeconds)
 */

import { useState, useEffect } from 'react';
import { SWAP_CONFIG } from '../utils/constants';

const TICK_INTERVAL_MS = 50; // 20 ticks per second

/** Fixed launch time - January 22, 2026 13:00 UTC */
const LAUNCH_TIME_MS = new Date('2026-01-22T13:00:00Z').getTime();

interface UseTickingRateOptions {
  /** Whether to enable ticking */
  enabled?: boolean;
}

interface UseTickingRateResult {
  /** The interpolated rate that ticks smoothly */
  tickingRate: number;
  /** Elapsed seconds since launch (also ticking) */
  elapsedSeconds: number;
  /** Whether the swap has launched */
  isLaunched: boolean;
}

export function useTickingRate({
  enabled = true,
}: UseTickingRateOptions = {}): UseTickingRateResult {
  const [tickingRate, setTickingRate] = useState<number>(SWAP_CONFIG.startRate);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isLaunched, setIsLaunched] = useState<boolean>(false);

  // Tick the rate at 20fps
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const msSinceLaunch = now - LAUNCH_TIME_MS;
      
      // Not launched yet
      if (msSinceLaunch < 0) {
        setIsLaunched(false);
        setTickingRate(SWAP_CONFIG.startRate);
        setElapsedSeconds(0);
        return;
      }
      
      setIsLaunched(true);
      
      // Calculate elapsed seconds, capped at duration
      const elapsed = Math.min(
        msSinceLaunch / 1000,
        SWAP_CONFIG.durationSeconds
      );
      
      // Calculate rate from elapsed time
      const rate = SWAP_CONFIG.startRate + 
        ((SWAP_CONFIG.endRate - SWAP_CONFIG.startRate) * elapsed / SWAP_CONFIG.durationSeconds);
      
      setTickingRate(rate);
      setElapsedSeconds(elapsed);
    };

    // Initial tick
    tick();

    // Only set up interval if enabled
    if (!enabled) {
      return;
    }

    const interval = setInterval(tick, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled]);

  return {
    tickingRate,
    elapsedSeconds,
    isLaunched,
  };
}
