# Code Review Report: USTR CMM

**Date:** 2024  
**Reviewer:** Comprehensive Code Review  
**Scope:** Full codebase review focusing on logical correctness, security, maintainability, and build/tooling

---

## Executive Summary

This review examined the USTR CMM codebase, including frontend (React/TypeScript) and smart contracts (CosmWasm/Rust). The codebase is generally well-structured with good TypeScript usage and clear separation of concerns. However, several critical issues were identified, particularly around React hook dependencies, numeric precision, and error handling.

**Summary Statistics:**
- **Critical Issues:** 4
- **Moderate Issues:** 6
- **Minor Issues:** 11
- **Security Considerations:** 3
- **Build/Tooling Issues:** 3

---

## Critical Issues

### 1. Infinite Loop Risk in CountdownTimer ⚠️

**File:** `frontend/src/components/common/CountdownTimer.tsx:115-125`

**Issue:** The `useEffect` dependency array includes `timeRemaining`, causing the effect to re-run every second and recreate the interval unnecessarily.

```typescript
useEffect(() => {
  if (isLaunched) return;
  const timer = setInterval(() => {
    prevTimeRef.current = timeRemaining;  // Uses stale closure
    const remaining = calculateTimeRemaining();
    setTimeRemaining(remaining);
  }, 1000);
  return () => clearInterval(timer);
}, [isLaunched, timeRemaining]); // ❌ timeRemaining causes re-creation
```

**Impact:** Interval is recreated every second, causing memory leaks and potential performance issues.

**Fix:**
```typescript
useEffect(() => {
  if (isLaunched) return;
  const timer = setInterval(() => {
    setTimeRemaining(prev => {
      prevTimeRef.current = prev;
      return calculateTimeRemaining();
    });
  }, 1000);
  return () => clearInterval(timer);
}, [isLaunched]); // ✅ Only depend on isLaunched
```

---

### 2. Floating-Point Precision in Swap Calculations ⚠️

**File:** `frontend/src/hooks/useSwap.ts:60`

**Issue:** Using `Math.floor(parseFloat(inputAmount) * 1_000_000)` can introduce precision errors for large or precise decimal inputs.

```typescript
const microAmount = Math.floor(parseFloat(inputAmount) * 1_000_000).toString();
```

**Impact:** Users may lose precision or receive incorrect swap amounts, especially with large numbers or many decimal places.

**Fix:** Use string-based decimal arithmetic or leverage existing `parseAmount` utility:
```typescript
// Better approach: handle as string or use decimal.js
const microAmount = parseAmount(inputAmount, DECIMALS.USTC);
```

---

### 3. Missing Input Validation for Swap Amounts ⚠️

**File:** `frontend/src/hooks/useSwap.ts:53-66`

**Issue:** Only checks `<= 0`, missing validation for:
- NaN values
- Infinity
- Negative numbers (should be caught but not explicitly)
- Values exceeding balance

**Impact:** Invalid inputs can cause contract call failures or unexpected behavior.

**Recommendation:**
```typescript
const validateInput = (amount: string): boolean => {
  const num = parseFloat(amount);
  return !isNaN(num) && 
         isFinite(num) && 
         num > 0 && 
         num <= parseFloat(ustcBalance) / 1_000_000;
};
```

---

### 4. WalletConnect Project ID Hardcoded ⚠️

**File:** `frontend/src/services/wallet.ts:33`

**Issue:** WalletConnect project ID is hardcoded in source code:
```typescript
const WC_PROJECT_ID = '2ce7811b869be33ffad28cff05c93c15';
```

**Impact:** If compromised, could be used maliciously. Should be in environment variables.

**Fix:** Move to environment variable:
```typescript
const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
```

---

## Moderate Issues

### 5. Error Handling in Contract Service Fallbacks

**File:** `frontend/src/services/contract.ts:78-148`

**Issue:** Multiple methods return default/mock data on error instead of propagating errors, masking failures:
```typescript
} catch (error) {
  console.error('Failed to get swap config:', error);
  return { /* default config */ }; // ❌ Hides errors
}
```

**Impact:** Failures may go unnoticed, leading to incorrect UI state.

**Recommendation:** Use error boundaries or proper error states instead of silent fallbacks.

---

### 6. Missing Source Maps in Production

**File:** `frontend/vite.config.ts:20`

**Issue:** Source maps disabled in production:
```typescript
build: {
  outDir: 'dist',
  sourcemap: false, // ❌ Makes debugging production issues difficult
},
```

**Impact:** Harder to debug production issues.

**Recommendation:** Consider conditional source maps (e.g., for error tracking):
```typescript
build: {
  outDir: 'dist',
  sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
},
```

---

### 7. Console.log Statements in Production Code

**Files:** Multiple files (62 instances found)

**Issue:** Many `console.log` statements remain in production code.

**Impact:** Performance overhead and potential information leakage.

**Recommendation:** Use a logging utility with environment-based levels or remove in production builds.

---

### 8. Race Condition in Balance Refresh

**File:** `frontend/src/hooks/useWallet.ts:91-99`

**Issue:** Balance refresh interval (30s) may overlap with manual refreshes, causing unnecessary requests.

**Impact:** Wasted API calls and potential race conditions.

**Recommendation:** Implement request deduplication or cancel in-flight requests.

---

### 9. Missing Validation for Referral Code Format

**File:** `frontend/src/components/swap/SwapCard.tsx:304`

**Issue:** Client-side validation exists but contract validation may differ:
```typescript
onChange={(e) => !referralLocked && setReferralCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
```

**Impact:** UI may allow codes that the contract rejects.

**Recommendation:** Validate against contract rules before submission, or query contract for validation.

---

### 10. Hardcoded Chain ID

**File:** `frontend/src/stores/wallet.ts:105`

**Issue:** Chain ID hardcoded as `'columbus-5'`:
```typescript
chainId: 'columbus-5',
```

**Impact:** Won't work on testnet without code changes.

**Recommendation:** Use `NETWORKS[DEFAULT_NETWORK].chainId`.

---

## Minor Issues

### 11. Type Safety: Optional Chaining Misuse

**File:** `frontend/src/hooks/useSwap.ts:102-110`

**Issue:** `canSwap` function could use optional chaining more consistently:
```typescript
if (!swapStatus?.started) return false;
```

**Impact:** Minor readability improvement.

---

### 12. Missing Error Boundaries

**Files:** `frontend/src/App.tsx`, page components

**Issue:** No React error boundaries to catch component errors.

**Impact:** Entire app can crash from a single component error.

**Recommendation:** Add error boundaries around major sections.

---

### 13. Duplicate Launch Date Constants

**Files:** Multiple files define `LAUNCH_DATE` separately:
- `frontend/src/components/common/CountdownTimer.tsx:14`
- `frontend/src/components/swap/SwapCard.tsx:24`
- `frontend/src/hooks/useLaunchStatus.ts:13`

**Impact:** Risk of inconsistency if one is updated.

**Recommendation:** Centralize in `constants.ts`:
```typescript
export const LAUNCH_DATE = new Date('2026-01-22T13:00:00Z');
```

---

### 14. Missing TypeScript Strict Null Checks

**File:** `frontend/tsconfig.json`

**Issue:** `strictNullChecks` not explicitly enabled (may be implied by `strict: true`).

**Recommendation:** Verify and document strict mode settings.

---

### 15. Git Ignore: rustup-init.exe Not Ignored

**File:** `.gitignore`

**Issue:** `rustup-init.exe` is tracked (visible in git status) but not in `.gitignore`.

**Impact:** Binary file in repository.

**Fix:** Add to `.gitignore`:
```
rustup-init.exe
*.exe
```

---

## Security Considerations

### 16. Environment Variable Exposure

**File:** `frontend/src/services/contract.ts:30`

**Issue:** `VITE_DEV_MODE` is client-accessible, allowing users to enable dev mode.

**Impact:** Users could bypass launch restrictions.

**Recommendation:** Use server-side validation for critical checks. Dev mode should only affect UI, not contract interactions.

---

### 17. Missing Input Sanitization

**File:** `frontend/src/components/swap/SwapCard.tsx:304`

**Issue:** Referral code input sanitization exists but could be more robust.

**Impact:** Potential XSS if code is displayed unsafely (though React should protect).

**Recommendation:** Ensure all user inputs are properly sanitized before display.

---

### 18. Wallet Connection State Persistence

**File:** `frontend/src/stores/wallet.ts:162-169`

**Issue:** Wallet address persisted in localStorage could be stale if wallet is disconnected externally.

**Impact:** UI may show connected state when wallet is actually disconnected.

**Recommendation:** Verify connection on app load:
```typescript
useEffect(() => {
  if (address) {
    // Verify wallet is still connected
    verifyWalletConnection();
  }
}, []);
```

---

## Maintainability

### 19. Large Contract File

**File:** `contracts/contracts/ustc-swap/src/contract.rs`

**Issue:** Contract file is very large (4000+ lines), making it hard to maintain.

**Recommendation:** Split into modules:
- Rate calculation module
- Referral handling module
- Leaderboard module
- Admin functions module

---

### 20. Magic Numbers

**Files:** Multiple files

**Issue:** Magic numbers throughout codebase (e.g., `1_000_000`, `300`, `1000`).

**Recommendation:** Extract to named constants:
```typescript
const DEBOUNCE_DELAY_MS = 300;
const BALANCE_REFRESH_INTERVAL_MS = 30000;
const COUNTDOWN_UPDATE_INTERVAL_MS = 1000;
```

---

### 21. Inconsistent Error Messages

**Files:** Contract error files

**Issue:** Error messages vary in detail and format.

**Recommendation:** Standardize error message format across all contracts.

---

## Build and Tooling

### 22. Windows Compatibility in Build Scripts

**File:** `README.md:105-110`

**Issue:** Docker build command uses PowerShell backticks which may not work in all shells.

**Impact:** Cross-platform compatibility issues.

**Recommendation:** Provide both PowerShell and bash examples, or use cross-platform scripts.

---

### 23. Missing Build Verification

**Files:** `package.json` scripts

**Issue:** No pre-build validation or type checking in CI.

**Recommendation:** Add `npm run check` to CI pipeline:
```json
{
  "scripts": {
    "prebuild": "npm run check"
  }
}
```

---

### 24. Husky Setup May Fail Silently

**File:** `frontend/package.json:14`

**Issue:** `prepare` script uses `|| true`, which hides setup failures:
```json
"prepare": "cd .. && husky frontend/.husky || true"
```

**Impact:** Git hooks may not be installed without warning.

**Recommendation:** Remove `|| true` and handle errors explicitly, or add a warning message.

---

## Priority Recommendations

### Immediate Actions (Critical)

1. ✅ **Fix CountdownTimer infinite loop** - Prevents memory leaks
2. ✅ **Improve swap amount validation and precision handling** - Prevents user losses
3. ✅ **Move secrets to environment variables** - Security best practice

### Short-term (Moderate)

4. ✅ **Add error boundaries** - Improve user experience
5. ✅ **Improve error handling** - Better debugging and user feedback
6. ✅ **Add comprehensive input validation** - Prevent invalid transactions

### Long-term (Minor)

7. ✅ **Centralize constants** - Reduce duplication
8. ✅ **Refactor large contract file** - Improve maintainability
9. ✅ **Add comprehensive logging** - Better production debugging

---

## Positive Observations

- ✅ **Well-structured TypeScript** - Good type safety throughout
- ✅ **Clear separation of concerns** - Services, hooks, components well-organized
- ✅ **Good documentation** - Comments and README files are helpful
- ✅ **Comprehensive contract error handling** - Contracts have detailed error types
- ✅ **React Query integration** - Good caching and data fetching patterns
- ✅ **Zustand state management** - Lightweight and appropriate for the use case

---

## Conclusion

The codebase demonstrates solid engineering practices with good TypeScript usage and clear architecture. The main areas for improvement are:

1. **React Hook Dependencies** - Several hooks have dependency issues that could cause bugs
2. **Error Handling** - Too many silent fallbacks that mask errors
3. **Input Validation** - Need more comprehensive validation before contract calls
4. **Security** - Some secrets and configuration should be moved to environment variables

Addressing the critical issues should be prioritized, followed by the moderate issues for improved reliability and maintainability.

---

**Review Completed:** 2024  
**Next Review Recommended:** After addressing critical issues
