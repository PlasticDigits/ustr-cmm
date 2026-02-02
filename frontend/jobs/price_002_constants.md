---
context_files:
  - src/utils/constants.ts
  - src/types/price.ts
depends_on:
  - price_001_types
output_dir: src/utils/
output_file: constants.ts
edit_mode: true
---

# Add DEX Router Constants

Add DEX router/factory addresses and Binance API URL to constants.ts.

## Requirements

Add these new exports after the existing constants:

### DEX_ROUTERS
```typescript
export const DEX_ROUTERS = {
  // Priority order for price fallback: custom -> garuda -> terraswap
  custom: null, // Placeholder for future USTR DEX
  garuda: {
    factory: 'terra1ypwj6sw25g0qcykv7mzmcvsndvx56r3yrgkaw3fds7yzwl7fwwcsnxkeh7',
    router: 'terra1frvfffkpdluzdj8lel4nyyjl2u0p6zuenhfeveulrlg6r2w4tdqqx2zr68',
  },
  terraswap: {
    factory: null,
    router: 'terra1g3zc8lwwmkrm0cz9wkgl849pdqaw6cq8lh7872',
  },
} as const;
```

### PRICE_API
```typescript
export const PRICE_API = {
  binance: 'https://api.binance.com/api/v3/ticker/price',
  // Symbols to fetch from Binance
  symbols: ['LUNCUSDT', 'USTCUSDT'],
} as const;
```

### PRICE_CACHE
```typescript
export const PRICE_CACHE = {
  // Cache durations in milliseconds
  basePrices: 60000,    // 60 seconds for CEX prices
  dexRates: 120000,     // 120 seconds for DEX rates
  staleTime: 30000,     // 30 seconds before considered stale
} as const;
```

## Edit Instructions

1. Add the new constants after the existing `TOAST_DURATION` constant
2. Keep all existing constants unchanged
3. Use `as const` for type safety
