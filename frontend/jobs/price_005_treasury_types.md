---
context_files:
  - src/types/treasury.ts
depends_on:
  - price_001_types
output_dir: src/types/
output_file: treasury.ts
edit_mode: true
---

# Add USD Value to TreasuryAsset

Add optional usdValue field to the TreasuryAsset interface.

## Requirements

Edit the TreasuryAsset interface to add a new optional field:

### Before
```typescript
export interface TreasuryAsset {
  /** Asset denomination (e.g., 'ustc', 'alpha') */
  denom: string;
  /** Raw balance in smallest unit */
  balance: bigint;
  /** Decimal places for display */
  decimals: number;
  /** Human readable name (e.g., 'USTC', 'ALPHA') */
  displayName: string;
  /** Tailwind gradient classes for the asset icon */
  gradient: string;
  /** Tailwind text color class for the asset icon */
  iconColor: string;
}
```

### After
```typescript
export interface TreasuryAsset {
  /** Asset denomination (e.g., 'ustc', 'alpha') */
  denom: string;
  /** Raw balance in smallest unit */
  balance: bigint;
  /** Decimal places for display */
  decimals: number;
  /** Human readable name (e.g., 'USTC', 'ALPHA') */
  displayName: string;
  /** Tailwind gradient classes for the asset icon */
  gradient: string;
  /** Tailwind text color class for the asset icon */
  iconColor: string;
  /** USD value of the balance (optional, may not be available for all tokens) */
  usdValue?: number;
}
```

## Edit Instructions

1. Add the `usdValue?: number` field as the last property in TreasuryAsset
2. Include JSDoc comment explaining the field
3. Keep all other fields and comments unchanged
