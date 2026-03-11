---
context_files:
  - src/components/treasury/TreasuryAssetsCard.tsx
  - src/types/treasury.ts
  - src/hooks/usePrices.ts
  - src/utils/format.ts
depends_on:
  - price_004_hook
  - price_005_treasury_types
output_dir: src/components/treasury/
output_file: TreasuryAssetsCard.tsx
edit_mode: true
---

# Display USD Values in TreasuryAssetsCard

Update TreasuryAssetsCard to show USD values for each asset.

## Requirements

### Add Import
Add the usePrices hook import:
```typescript
import { usePrices } from '../../hooks';
```

### Add formatUsd Helper
Add a helper function inside the component or import from format.ts:
```typescript
const formatUsd = (value: number): string => {
  if (value < 0.01) {
    return `$${value.toFixed(6)}`;
  }
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
```

### Use Prices Hook
Inside the component, call usePrices to get price data:
```typescript
const { prices, isLoading: pricesLoading } = usePrices();
```

### Calculate USD Value for Each Asset
For each asset in the grid, calculate its USD value:
```typescript
const displayBalance = Number(asset.balance) / Math.pow(10, asset.decimals);
const priceUsd = prices[asset.displayName] ?? 0;
const valueUsd = displayBalance * priceUsd;
```

### Update Asset Display
Modify the asset item to show USD value below the token amount:

**Current:**
```tsx
<span className={`text-lg font-mono-numbers font-semibold ${asset.iconColor}`}>
  {formatAmount(asset.balance, asset.decimals)}
</span>
```

**Updated:**
```tsx
<div className="text-right">
  <div className={`text-lg font-mono-numbers font-semibold ${asset.iconColor}`}>
    {formatAmount(asset.balance, asset.decimals)}
  </div>
  {priceUsd > 0 && (
    <div className="text-xs text-gray-400">
      {formatUsd(valueUsd)}
    </div>
  )}
</div>
```

## Edit Instructions

1. Add the usePrices import at the top with other hook imports
2. Add formatUsd helper function (or import if adding to format.ts)
3. Call usePrices() hook inside the component function
4. In the asset mapping, calculate USD value for each asset
5. Update the JSX to show USD value below the token amount
6. Only show USD value if priceUsd > 0 (price available)
