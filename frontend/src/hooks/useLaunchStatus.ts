/**
 * Launch Status Hook
 * 
 * Provides the launch status based on the countdown timer.
 * Returns true when the launch date has been reached.
 */

import { useEffect, useState } from 'react';

const LAUNCH_DATE = new Date('2026-01-22T13:00:00Z');

export function useLaunchStatus() {
  const [isLaunched, setIsLaunched] = useState(() => {
    const now = new Date().getTime();
    const target = LAUNCH_DATE.getTime();
    return target <= now;
  });

  useEffect(() => {
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
