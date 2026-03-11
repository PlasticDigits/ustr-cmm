---
context_files:
  - src/hooks/index.ts
  - src/hooks/usePrices.ts
depends_on:
  - price_004_hook
output_dir: src/hooks/
output_file: index.ts
edit_mode: true
---

# Export usePrices Hook

Add usePrices export to the hooks barrel file.

## Requirements

Add the usePrices export to src/hooks/index.ts.

### Current exports:
```typescript
export { useWallet } from './useWallet';
export { useSwap } from './useSwap';
export { useLaunchStatus } from './useLaunchStatus';
export { useReferralStorage, getStoredReferralCode, saveReferralCode, clearReferralCode } from './useReferralStorage';
export { 
  useTreasuryConfig,
  useTreasuryBalances,
  useTokenInfo,
  useTokenBalance,
  useNativeBalance,
  useSwapConfig,
  useContractQuery,
  useInvalidateQueries,
} from './useContract';
export { useTreasury } from './useTreasury';
```

### Add this line at the end:
```typescript
export { usePrices } from './usePrices';
```

## Edit Instructions

1. Add the new export line after the existing useTreasury export
2. Keep all existing exports unchanged
