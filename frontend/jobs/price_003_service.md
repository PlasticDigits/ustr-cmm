---
context_files:
  - src/types/price.ts
  - src/utils/constants.ts
depends_on:
  - price_001_types
  - price_002_constants
output_dir: src/services/
output_file: price.ts
---

# Create Price Service

Create a PriceService class that fetches USD prices with DEX fallback chain.

## Requirements

### Class Structure

```typescript
class PriceService {
  private lcdUrl: string;
  
  constructor();
  
  // Fetch LUNC and USTC prices from Binance
  async fetchBasePrices(): Promise<{ lunc: number; ustc: number }>;
  
  // Get token price in USD with DEX fallback
  async getTokenPriceUsd(tokenAddress: string, luncUsd: number): Promise<number | null>;
  
  // Query Garuda Defi for token/LUNC rate
  private async queryGarudaPrice(tokenAddress: string): Promise<number | null>;
  
  // Query Terraswap for token/LUNC rate
  private async queryTerraswapPrice(tokenAddress: string): Promise<number | null>;
  
  // Placeholder for custom DEX (future)
  private async queryCustomDexPrice(tokenAddress: string): Promise<number | null>;
  
  // Helper to query smart contract
  private async queryContract<T>(contractAddress: string, query: object): Promise<T>;
}
```

### Implementation Details

1. **fetchBasePrices()**
   - Fetch from Binance: `GET ${PRICE_API.binance}?symbols=["LUNCUSDT","USTCUSDT"]`
   - Parse response array to extract prices
   - Return `{ lunc: number, ustc: number }`
   - Handle errors gracefully, return 0 if failed

2. **getTokenPriceUsd(tokenAddress, luncUsd)**
   - Try DEXes in priority order: custom -> garuda -> terraswap
   - Each returns LUNC amount per 1M token units
   - Calculate: `tokenUsd = (luncAmount / 1_000_000) * luncUsd`
   - Return null if all fail

3. **queryGarudaPrice(tokenAddress)**
   - First, get pair contract from factory:
     ```json
     {"pair":{"asset1":{"cw20":"TOKEN_ADDR"},"asset2":{"native":"uluna"}}}
     ```
   - Then simulate swap on pair contract:
     ```json
     {"simulate_swap":{"offer_asset":{"cw20":"TOKEN_ADDR"},"offer_amount":"1000000"}}
     ```
   - Return `returnAmount` as number, or null on error

4. **queryTerraswapPrice(tokenAddress)**
   - Query router with simulate_swap_operations:
     ```json
     {"simulate_swap_operations":{
       "offer_amount":"1000000",
       "operations":[{"terra_swap":{
         "offer_asset_info":{"token":{"contract_addr":"TOKEN_ADDR"}},
         "ask_asset_info":{"native_token":{"denom":"uluna"}}
       }}]
     }}
     ```
   - Return `amount` from response as number, or null on error

5. **queryCustomDexPrice()**
   - Return null for now (placeholder)

### Error Handling

- Wrap all fetch/query calls in try-catch
- Log errors but don't throw - return null/0
- Each DEX query should fail silently to allow fallback

### Export

Export singleton instance:
```typescript
export const priceService = new PriceService();
export { PriceService };
```

## Contract Addresses

Use from constants:
- `DEX_ROUTERS.garuda.factory`
- `DEX_ROUTERS.garuda.router` (not used, pair is queried directly)
- `DEX_ROUTERS.terraswap.router`
- `NETWORKS.mainnet.lcd` for LCD URL
