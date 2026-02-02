---
context_files:
  - src/types/treasury.ts
  - src/types/contracts.ts
output_dir: src/types/
output_file: price.ts
---

# Create Price Types

Create TypeScript interfaces for price data and DEX interactions.

## Requirements

Create the following interfaces and types:

### TokenPrice
- `symbol`: string - token symbol (e.g., 'LUNC', 'USTC', 'ALPHA')
- `usdPrice`: number - price in USD
- `source`: 'binance' | 'garuda' | 'terraswap' | 'custom' | 'calculated' - where price came from
- `lastUpdated`: Date - when price was fetched

### PriceData
- `prices`: Record<string, TokenPrice> - prices keyed by symbol
- `luncUsd`: number - LUNC price in USD (base price)
- `ustcUsd`: number - USTC price in USD (base price)
- `isLoading`: boolean
- `error`: string | null
- `lastUpdated`: Date

### DexConfig
- `factory`: string | null - factory contract address
- `router`: string | null - router contract address

### DexRouters
- `custom`: DexConfig | null - placeholder for future USTR DEX
- `garuda`: DexConfig - Garuda Defi contracts
- `terraswap`: DexConfig - Terraswap contracts

### SwapSimulationResult
- `returnAmount`: string - amount returned from swap
- `spreadAmount`: string - spread/slippage amount
- `commissionAmount`: string - commission taken

### GarudaPairInfo
- `asset1`: { cw20: string } | { native: string }
- `asset2`: { cw20: string } | { native: string }
- `contract`: string - pair contract address

## Implementation Notes

- Export all interfaces and types
- Add JSDoc comments explaining each interface
- Use string for contract addresses and amounts (CosmWasm convention)
- Include type guards if helpful
