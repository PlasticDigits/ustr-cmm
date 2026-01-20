/**
 * Launch Status Hook
 * 
 * Provides the launch status based on the countdown timer.
 * Returns true when the launch date has been reached.
 * 
 * In dev mode (VITE_DEV_MODE=true), always returns true to enable
 * testing the post-launch UI before the actual launch date.
 */

import { useEffect, useState } from 'react';

const LAUNCH_DATE = new Date('2026-01-22T13:00:00Z');

/** Dev mode flag - bypasses countdown timer for UX testing */
const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

export function useLaunchStatus() {
  // In dev mode, always report as launched for UX testing
  const [isLaunched, setIsLaunched] = useState(() => {
    if (DEV_MODE) return true;
    const now = new Date().getTime();
    const target = LAUNCH_DATE.getTime();
    return target <= now;
  });

  useEffect(() => {
    // Skip interval checking in dev mode - already launched
    if (DEV_MODE) return;

    const checkLaunch = () => {
      const now = new Date().getTime();
      const target = LAUNCH_DATE.getTime();
      if (target <= now && !isLaunched) {
        setIsLaunched(true);
      }
    };

    // Check immediately
    checkLaunch();

    // Check every second until launched
    const interval = setInterval(() => {
      checkLaunch();
      if (isLaunched) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLaunched]);

  return isLaunched;
}

/** Export dev mode flag for use by other components (e.g., dev mode banner) */
export const isDevMode = DEV_MODE;
