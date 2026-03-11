---
context_files:
  - src/types/price.ts
  - src/services/price.ts
  - src/hooks/useTreasury.ts
  - src/utils/constants.ts
depends_on:
  - price_001_types
  - price_003_service
output_dir: src/hooks/
output_file: usePrices.ts
---

# Create usePrices Hook

Create a React Query hook for fetching and caching token prices.

## Requirements

### Hook Signature

```typescript
export function usePrices(tokenAddresses?: string[]): {
  prices: Record<string, number>;  // symbol -> USD price
  luncUsd: number;
  ustcUsd: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}
```

### Implementation

1. **Use React Query** (`@tanstack/react-query`)
   - Query key: `['prices', 'base']` for base prices
   - Query key: `['prices', 'tokens', ...addresses]` for token prices
   - Use `PRICE_CACHE.staleTime` for staleTime
   - Use `PRICE_CACHE.basePrices` for refetchInterval

2. **Fetch Base Prices**
   - Call `priceService.fetchBasePrices()`
   - Store LUNC and USTC USD prices

3. **Fetch Token Prices**
   - For each token address in the list
   - Call `priceService.getTokenPriceUsd(address, luncUsd)`
   - Build Record<symbol, price>

4. **Default Token Addresses**
   - If no addresses provided, use known tokens from tokenlist
   - Include ALPHA address: `terra1x6e64es6yhauhvs3prvpdg2gkqdtfru840wgnhs935x8axr7zxkqzysuxz`

5. **Return Values**
   - `prices`: Map of symbol to USD price (include LUNC, USTC, ALPHA)
   - `luncUsd`: Direct access to LUNC price
   - `ustcUsd`: Direct access to USTC price
   - `isLoading`: True while fetching
   - `error`: Error message or null
   - `refetch`: Function to manually refresh

### Example Usage

```typescript
const { prices, luncUsd, ustcUsd, isLoading } = usePrices();

// Access prices
const alphaUsd = prices['ALPHA'] ?? 0;
const totalValue = balance * alphaUsd;
```

### Import Statements

```typescript
import { useQuery } from '@tanstack/react-query';
import { priceService } from '../services/price';
import { PRICE_CACHE } from '../utils/constants';
```
