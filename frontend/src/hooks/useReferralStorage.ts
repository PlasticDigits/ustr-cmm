/**
 * useReferralStorage Hook
 * 
 * Manages referral code persistence in local storage.
 * - Saves referral codes when visiting /swap/:code
 * - Retrieves stored codes for auto-filling on swap page or homepage
 * - Replaces stored code if a new one is used via URL
 */

import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'ustr_referral_code';

/**
 * Get the stored referral code from local storage
 */
export function getStoredReferralCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Save a referral code to local storage
 */
export function saveReferralCode(code: string): void {
  try {
    if (code) {
      localStorage.setItem(STORAGE_KEY, code);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear the stored referral code
 */
export function clearReferralCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

interface UseReferralStorageResult {
  /** The effective referral code (from URL or storage) */
  referralCode: string | null;
  /** Whether the referral code should be locked (from URL or storage) */
  isLocked: boolean;
  /** Save a new referral code to storage */
  saveCode: (code: string) => void;
  /** Clear the stored referral code */
  clearCode: () => void;
}

/**
 * Hook for managing referral code with local storage persistence.
 * 
 * @param urlCode - Referral code from URL parameter (takes priority and gets saved)
 * @returns Referral code state and actions
 */
export function useReferralStorage(urlCode?: string): UseReferralStorageResult {
  const [storedCode, setStoredCode] = useState<string | null>(() => getStoredReferralCode());

  // When URL code is provided, save it to storage (replaces existing)
  useEffect(() => {
    if (urlCode) {
      saveReferralCode(urlCode);
      setStoredCode(urlCode);
    }
  }, [urlCode]);

  const saveCode = useCallback((code: string) => {
    if (code) {
      saveReferralCode(code);
      setStoredCode(code);
    }
  }, []);

  const clearCode = useCallback(() => {
    clearReferralCode();
    setStoredCode(null);
  }, []);

  // URL code takes priority, otherwise use stored code
  const effectiveCode = urlCode || storedCode;
  
  // Lock the code if it came from URL or was previously stored
  const isLocked = !!effectiveCode;

  return {
    referralCode: effectiveCode,
    isLocked,
    saveCode,
    clearCode,
  };
}
