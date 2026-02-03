import { NETWORKS, DEX_ROUTERS, PRICE_API } from '../utils/constants';

/**
 * Service for fetching token prices with DEX fallback chain
 * 
 * This service fetches base prices from CEX (Binance) and
 * calculates token prices in USD using DEX rates with fallback.
 */
class PriceService {
  private lcdUrl: string;

  constructor() {
    this.lcdUrl = NETWORKS.mainnet.lcd;
  }

  /**
   * Fetch LUNC and USTC prices from Binance
 * 
 * @returns Object containing LUNC and USTC prices in USD
 */
  async fetchBasePrices(): Promise<{ lunc: number; ustc: number }> {
    try {
      // URL encode the symbols array for Binance API
      const symbols = encodeURIComponent('["LUNCUSDT","USTCUSDT"]');
      const response = await fetch(
        `${PRICE_API.binance}?symbols=${symbols}`
      );
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Binance returns array of price objects
      const prices = data.map((item: { symbol: string; price: string }) => ({
        symbol: item.symbol,
        price: parseFloat(item.price),
      }));

      const luncPrice = prices.find((p: { symbol: string; price: number }) => p.symbol === 'LUNCUSDT')?.price ?? 0;
      const ustcPrice = prices.find((p: { symbol: string; price: number }) => p.symbol === 'USTCUSDT')?.price ?? 0;

      return { lunc: luncPrice, ustc: ustcPrice };
    } catch (error) {
      console.error('Failed to fetch base prices from Binance:', error);
      return { lunc: 0, ustc: 0 };
    }
  }

  /**
   * Get token price in USD with DEX fallback
 * 
 * If poolAddress is provided, queries that pool directly.
 * Otherwise tries DEXes in priority order: custom -> garuda -> terraswap
 * Each returns LUNC amount per 1M token units
 * 
 * @param tokenAddress - The CW20 token contract address
 * @param luncUsd - LUNC price in USD
 * @param poolAddress - Optional pool contract address to query directly
 * @returns Token price in USD, or null if all DEX queries fail
 */
  async getTokenPriceUsd(
    tokenAddress: string,
    luncUsd: number,
    poolAddress?: string
  ): Promise<number | null> {
    // If pool address provided, query it directly
    if (poolAddress) {
      const directPrice = await this.queryPoolDirectly(tokenAddress, poolAddress);
      if (directPrice !== null) {
        return this.calculateUsdPrice(directPrice, luncUsd);
      }
    }

    // Try DEXes in priority order
    const customPrice = await this.queryCustomDexPrice(tokenAddress);
    if (customPrice !== null) {
      return this.calculateUsdPrice(customPrice, luncUsd);
    }

    const garudaPrice = await this.queryGarudaPrice(tokenAddress);
    if (garudaPrice !== null) {
      return this.calculateUsdPrice(garudaPrice, luncUsd);
    }

    const terraswapPrice = await this.queryTerraswapPrice(tokenAddress);
    if (terraswapPrice !== null) {
      return this.calculateUsdPrice(terraswapPrice, luncUsd);
    }

    return null;
  }

  /**
   * Query a pool contract directly for token/LUNC rate
   * 
   * @param tokenAddress - The CW20 token contract address
   * @param poolAddress - The pool contract address
   * @returns LUNC amount per 1M token units, or null on error
   */
  private async queryPoolDirectly(tokenAddress: string, poolAddress: string): Promise<number | null> {
    try {
      // Simulate swap on pair contract (Garuda format)
      const simulateQuery = {
        simulate_swap: {
          offer_asset: { cw20: tokenAddress },
          offer_amount: '1000000',
        },
      };

      const simulateResult = await this.queryContract<{ return_amount: string }>(
        poolAddress,
        simulateQuery
      );

      if (!simulateResult || !simulateResult.return_amount) {
        return null;
      }

      return parseFloat(simulateResult.return_amount) || 0;
    } catch (error) {
      console.error('Direct pool query failed:', error);
      return null;
    }
  }

  /**
   * Calculate USD price from LUNC amount
 * 
 * @param luncAmount - LUNC amount per 1M token units
 * @param luncUsd - LUNC price in USD
 * @returns Token price in USD
 */
  private calculateUsdPrice(luncAmount: number, luncUsd: number): number {
    // LUNC amount is per 1M token units
    const tokenUsd = (luncAmount / 1_000_000) * luncUsd;
    return tokenUsd;
  }

  /**
   * Query Garuda Defi for token/LUNC rate
 * 
 * First gets the pair contract from factory, then simulates swap
 * 
 * @param tokenAddress - The CW20 token contract address
 * @returns LUNC amount per 1M token units, or null on error
 */
  private async queryGarudaPrice(tokenAddress: string): Promise<number | null> {
    try {
      const factoryAddress = DEX_ROUTERS.garuda.factory;
      if (!factoryAddress) {
        return null;
      }

      // Get pair contract
      const pairQuery = {
        pair: {
          asset1: { cw20: tokenAddress },
          asset2: { native: 'uluna' },
        },
      };

      const pairResult = await this.queryContract<{ contract: string }>(
        factoryAddress,
        pairQuery
      );

      if (!pairResult || !pairResult.contract) {
        return null;
      }

      const pairContract = pairResult.contract;

      // Simulate swap on pair contract
      const simulateQuery = {
        simulate_swap: {
          offer_asset: { cw20: tokenAddress },
          offer_amount: '1000000',
        },
      };

      const simulateResult = await this.queryContract<{ return_amount: string }>(
        pairContract,
        simulateQuery
      );

      if (!simulateResult || !simulateResult.return_amount) {
        return null;
      }

      return parseFloat(simulateResult.return_amount) || 0;
    } catch (error) {
      console.error('Garuda price query failed:', error);
      return null;
    }
  }

  /**
   * Query Terraswap for token/LUNC rate
 * 
 * @param tokenAddress - The CW20 token contract address
 * @returns LUNC amount per 1M token units, or null on error
 */
  private async queryTerraswapPrice(_tokenAddress: string): Promise<number | null> {
    try {
      const routerAddress = DEX_ROUTERS.terraswap.router;
      if (!routerAddress) {
        return null;
      }

      const simulateQuery = {
        simulate_swap_operations: {
          offer_amount: '1000000',
          operations: [
            {
              terra_swap: {
                offer_asset_info: {
                  token: { contract_addr: _tokenAddress },
                },
                ask_asset_info: {
                  native_token: { denom: 'uluna' },
                },
              },
            },
          ],
        },
      };

      const result = await this.queryContract<{ amount: string }>(
        routerAddress,
        simulateQuery
      );

      if (!result || !result.amount) {
        return null;
      }

      return parseFloat(result.amount) || 0;
    } catch (error) {
      console.error('Terraswap price query failed:', error);
      return null;
    }
  }

  /**
   * Placeholder for custom DEX (future)
 * 
 * @param tokenAddress - The CW20 token contract address
 * @returns null for now
 */
  private async queryCustomDexPrice(_tokenAddress: string): Promise<number | null> {
    // Placeholder for future USTR DEX
    return null;
  }

  /**
   * Helper to query smart contract via LCD
   * 
   * @param contractAddress - The contract address to query
   * @param query - The query payload
   * @returns Parsed response data
   */
  private async queryContract<T>(
    contractAddress: string,
    query: object
  ): Promise<T> {
    // Terra Classic LCD uses GET with base64 encoded query
    const queryBase64 = btoa(JSON.stringify(query));
    const url = `${this.lcdUrl}/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${queryBase64}`;
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`LCD query error: ${response.statusText}`);
    }

    const result = await response.json();
    // LCD response wraps data in { data: ... }
    return result.data as T;
  }
}

export const priceService = new PriceService();
export { PriceService };