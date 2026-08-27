import { NETWORKS, DEX_ROUTERS, PRICE_API, LCD_CONFIG, CONTRACTS, DEFAULT_NETWORK, VFDUSD_ORACLE } from '../utils/constants';
import { isTerraContractAddress } from '../utils/addresses';
import { wholeTokenBaseAmount } from '../utils/decimals';
import { parseDexPoolState, quoteRawForOneWhole } from '../utils/lpPoolParse';
import {
  extractOracleRateString,
  readVfdusdSessionPrice,
  vfdusdUsdFromOracleState,
  writeVfdusdSessionPrice,
  type Ust1OracleState,
} from '../utils/vfdusdOracle';

/**
 * Service for fetching token prices with DEX fallback chain
 * 
 * This service fetches base prices from CEX (Binance) and
 * calculates token prices in USD using DEX rates with fallback.
 * Uses LCD endpoint fallbacks to ensure reliability.
 */
class PriceService {
  private lcdEndpoints: readonly string[];
  /** Track unhealthy endpoints with cooldown timestamps */
  private unhealthyEndpoints: Map<string, number> = new Map();
  /** Shared LCD min-interval (same knob as contractService) */
  private lastLcdRequestAt = 0;
  /** In-flight vFDUSD oracle fetch — Strict Mode / two cards share one request */
  private vfdusdInFlight: Promise<number | null> | null = null;

  constructor() {
    // Use fallback list from constants, with primary endpoint first
    this.lcdEndpoints = NETWORKS.mainnet.lcdFallbacks;
  }

  /**
   * Get healthy endpoints (not in cooldown)
   */
  private getHealthyEndpoints(): string[] {
    const now = Date.now();
    return this.lcdEndpoints.filter(endpoint => {
      const cooldownUntil = this.unhealthyEndpoints.get(endpoint);
      if (cooldownUntil && now < cooldownUntil) {
        return false; // Still in cooldown
      }
      // Cooldown expired, remove from unhealthy list
      if (cooldownUntil) {
        this.unhealthyEndpoints.delete(endpoint);
      }
      return true;
    });
  }

  /**
   * Mark an endpoint as unhealthy for the cooldown period
   */
  private markEndpointUnhealthy(endpoint: string): void {
    this.unhealthyEndpoints.set(endpoint, Date.now() + LCD_CONFIG.endpointCooldown);
  }

  /**
   * Parse Binance-style ticker price response into LUNC/USTC USD.
   */
  private parseBinanceTickers(
    data: { symbol: string; price: string } | { symbol: string; price: string }[]
  ): { lunc: number; ustc: number } {
    const rows = (Array.isArray(data) ? data : [data]).map((item) => ({
      symbol: item.symbol,
      price: parseFloat(item.price),
    }));
    return {
      lunc: rows.find((p) => p.symbol === 'LUNCUSDT')?.price ?? 0,
      ustc: rows.find((p) => p.symbol === 'USTCUSDT')?.price ?? 0,
    };
  }

  /**
   * Fetch LUNC/USTC from a Binance-compatible ticker endpoint.
   */
  private async fetchBinanceBasePrices(
    baseUrl: string
  ): Promise<{ lunc: number; ustc: number } | null> {
    const symbols = encodeURIComponent('["LUNCUSDT","USTCUSDT"]');
    const response = await fetch(`${baseUrl}?symbols=${symbols}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as
      | { symbol: string; price: string }
      | { symbol: string; price: string }[];
    return this.parseBinanceTickers(data);
  }

  /**
   * Fetch LUNC and USTC USD prices.
   * Tries Binance spot, then data-api.binance.vision, then CoinGecko.
   * Throws when every source fails so React Query can keep the last good prices.
   */
  async fetchBasePrices(): Promise<{ lunc: number; ustc: number }> {
    let lunc = 0;
    let ustc = 0;

    const binanceUrls = [PRICE_API.binance, PRICE_API.binanceDataApi];
    for (const url of binanceUrls) {
      if (lunc > 0 && ustc > 0) break;
      try {
        const prices = await this.fetchBinanceBasePrices(url);
        if (!prices) continue;
        if (lunc <= 0) lunc = prices.lunc;
        if (ustc <= 0) ustc = prices.ustc;
      } catch (error) {
        console.warn(`Binance base prices failed (${url}):`, error);
      }
    }

    if (lunc > 0 && ustc > 0) {
      return { lunc, ustc };
    }

    try {
      const response = await fetch(PRICE_API.coingecko);
      if (response.ok) {
        const data = (await response.json()) as Record<
          string,
          { usd?: number } | undefined
        >;
        if (lunc <= 0) {
          lunc = data[PRICE_API.coingeckoIds.lunc]?.usd ?? 0;
        }
        if (ustc <= 0) {
          ustc = data[PRICE_API.coingeckoIds.ustc]?.usd ?? 0;
        }
      } else {
        console.warn('CoinGecko base prices failed:', response.status);
      }
    } catch (error) {
      console.warn('CoinGecko base prices failed:', error);
    }

    if (lunc > 0 || ustc > 0) {
      return { lunc, ustc };
    }

    throw new Error('Failed to fetch LUNC/USTC base prices from Binance and CoinGecko');
  }

  /**
   * Session-once vFDUSD USD from ust1-oracle.
   * Success or recorded hard failure → no further LCD this tab session.
   * Never returns a fabricated $1/vFDUSD.
   */
  async getVfdusdUsdSessionOnce(): Promise<number | null> {
    const cached = readVfdusdSessionPrice();
    if (cached.status === 'ok') return cached.usd;
    if (cached.status === 'unavailable') return null;
    if (this.vfdusdInFlight) return this.vfdusdInFlight;

    this.vfdusdInFlight = this.fetchVfdusdOracleUsd()
      .catch((error) => {
        console.warn('vFDUSD oracle query failed:', error);
        writeVfdusdSessionPrice({
          v: VFDUSD_ORACLE.sessionSchemaVersion,
          status: 'unavailable',
          reason: 'network',
          fetchedAt: Date.now(),
        });
        return null;
      })
      .finally(() => {
        this.vfdusdInFlight = null;
      });

    return this.vfdusdInFlight;
  }

  private async fetchVfdusdOracleUsd(): Promise<number | null> {
    const oracle = CONTRACTS[DEFAULT_NETWORK].ust1Oracle;
    if (!isTerraContractAddress(oracle)) {
      writeVfdusdSessionPrice({
        v: VFDUSD_ORACLE.sessionSchemaVersion,
        status: 'unavailable',
        reason: 'invalid',
        fetchedAt: Date.now(),
      });
      return null;
    }

    const state = await this.queryContract<Ust1OracleState>(oracle, { state: {} });
    if (state?.paused === true) {
      writeVfdusdSessionPrice({
        v: VFDUSD_ORACLE.sessionSchemaVersion,
        status: 'unavailable',
        reason: 'paused',
        fetchedAt: Date.now(),
      });
      return null;
    }

    const usd = vfdusdUsdFromOracleState(state);
    const rate = extractOracleRateString(state);
    if (usd === null || !rate) {
      writeVfdusdSessionPrice({
        v: VFDUSD_ORACLE.sessionSchemaVersion,
        status: 'unavailable',
        reason: 'invalid',
        fetchedAt: Date.now(),
      });
      return null;
    }

    writeVfdusdSessionPrice({
      v: VFDUSD_ORACLE.sessionSchemaVersion,
      status: 'ok',
      usd,
      rate,
      fetchedAt: Date.now(),
    });
    return usd;
  }

  /**
   * Get token price in USD with DEX fallback
   *
   * If pool config is provided, queries that pool directly.
   * Otherwise tries DEXes in priority order: custom -> garuda -> terraswap
   * Quote legs are 6dp (LUNC / USTC / cUSTC). Offer is 1 whole token (`10^decimals`).
   *
   * @param tokenAddress - The CW20 token contract address (spot token only — never an LP mint, #14)
   * @param luncUsd - LUNC price in USD
   * @param ustcUsd - USTC price in USD
   * @param pool - Optional pool config with address, dex type, and quote asset
   * @param decimals - Token decimals. Garuda/Terraswap 1e6 fallback is 6dp only —
   *   never use it for CL8Y-cb (18dp). CL8Y dex prices via LCD pool reserve ratio,
   *   not simulate-swap (#20).
   * @returns Token price in USD, or null if all DEX queries fail
   */
  async getTokenPriceUsd(
    tokenAddress: string,
    luncUsd: number,
    ustcUsd: number,
    pool?: { address: string; dex: string; quoteAsset?: string },
    decimals: number = 6
  ): Promise<number | null> {
    const offer = wholeTokenBaseAmount(decimals);
    if (offer === null) {
      return null;
    }

    // If pool config provided, query it directly
    if (pool) {
      const directPrice = await this.queryPoolDirectly(tokenAddress, pool.address, pool.dex, offer);
      if (directPrice !== null) {
        const baseUsd = pool.quoteAsset === 'ustc' ? ustcUsd : luncUsd;
        return this.calculateUsdPrice(directPrice, baseUsd);
      }
      // Explicit pool failed: do not invent a 1e6 Garuda quote for non-6dp tokens.
      if (decimals !== 6) {
        return null;
      }
    }

    // 18dp CW20s (CL8Y-cb) must not use the historical 1e6 simulate fallback.
    if (decimals !== 6) {
      return null;
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
   * Query a pool contract directly for token price
   *
   * Supports Garuda (simulate_swap), TerraSwap/Terraport (simulation), and CL8Y
   * (LCD `{ pool: {} }` reserve ratio — pair has `hybrid_simulation`, not `simulation`).
   *
   * Offer is 1 whole token. Quote legs are 6dp (LUNC / USTC / cUSTC), so
   * `calculateUsdPrice` still divides by 1e6.
   *
   * @param tokenAddress - The CW20 token contract address
   * @param poolAddress - The pool contract address
   * @param dexType - The DEX type ('garuda', 'terraport', 'terraswap', 'cl8y')
   * @param offerAmount - Raw offer amount (1 whole token)
   * @returns Quote asset amount for 1 whole token, or null on error
   */
  private async queryPoolDirectly(
    tokenAddress: string,
    poolAddress: string,
    dexType: string,
    offerAmount: bigint
  ): Promise<number | null> {
    try {
      let simulateResult: { return_amount: string } | null = null;
      const amount = offerAmount.toString();
      const dex = dexType.toLowerCase();

      if (dex === 'cl8y') {
        // CL8Y pair QueryMsg has hybrid_simulation, not Terraswap simulation.
        // Spot USD = LCD pool reserve ratio (same basis as LP NAV). Never LP-mint swap.
        const pool = await this.queryContract<unknown>(poolAddress, { pool: {} });
        const parsed = parseDexPoolState('cl8y', pool);
        if (!parsed || parsed.reserves.length !== 2) {
          return null;
        }
        const offerRes = parsed.reserves.find((r) => r.address === tokenAddress);
        const quoteRes = parsed.reserves.find((r) => r !== offerRes);
        if (!offerRes || !quoteRes) {
          return null;
        }
        const quoteRaw = quoteRawForOneWhole(offerRes.amountRaw, quoteRes.amountRaw, offerAmount);
        if (quoteRaw === null || quoteRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
          return null;
        }
        return Number(quoteRaw.toString());
      }

      if (dex === 'terraport' || dex === 'terraswap') {
        // TerraSwap/Terraport simulation format
        const simulateQuery = {
          simulation: {
            offer_asset: {
              info: { token: { contract_addr: tokenAddress } },
              amount,
            },
          },
        };

        simulateResult = await this.queryContract<{ return_amount: string }>(
          poolAddress,
          simulateQuery
        );
      } else {
        // Garuda simulate_swap format (default)
        const simulateQuery = {
          simulate_swap: {
            offer_asset: { cw20: tokenAddress },
            offer_amount: amount,
          },
        };

        simulateResult = await this.queryContract<{ return_amount: string }>(
          poolAddress,
          simulateQuery
        );
      }

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
   * Calculate USD price from quote asset amount
   *
   * @param quoteAmount - Quote asset raw amount for 1 whole offer token (6dp LUNC/USTC/cUSTC)
   * @param quoteUsd - Quote asset price in USD (LUNC or USTC USD price)
   * @returns Token price in USD
   */
  private calculateUsdPrice(quoteAmount: number, quoteUsd: number): number {
    // Quote amount is per 1M token units
    const tokenUsd = (quoteAmount / 1_000_000) * quoteUsd;
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
   * Fetch with timeout support
   */
  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Helper to query smart contract via LCD with endpoint fallback
   * 
   * Tries each healthy endpoint in order until one succeeds.
   * Failed endpoints are marked unhealthy and skipped for a cooldown period.
   * 
   * @param contractAddress - The contract address to query
   * @param query - The query payload
   * @returns Parsed response data
   * @throws Error if all endpoints fail
   */
  private async waitForLcdSlot(): Promise<void> {
    const elapsed = Date.now() - this.lastLcdRequestAt;
    const wait = LCD_CONFIG.minRequestInterval - elapsed;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastLcdRequestAt = Date.now();
  }

  private async queryContract<T>(
    contractAddress: string,
    query: object
  ): Promise<T> {
    // Terra Classic LCD uses GET with base64 encoded query
    const queryBase64 = btoa(JSON.stringify(query));
    
    // Get healthy endpoints first, fall back to all endpoints if all are unhealthy
    let endpoints: readonly string[] = this.getHealthyEndpoints();
    if (endpoints.length === 0) {
      // All endpoints in cooldown, try them all anyway
      endpoints = this.lcdEndpoints;
    }
    
    let lastError: Error | null = null;
    
    for (const endpoint of endpoints) {
      const url = `${endpoint}/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${queryBase64}`;
      
      try {
        await this.waitForLcdSlot();
        const response = await this.fetchWithTimeout(url, LCD_CONFIG.requestTimeout);

        if (!response.ok) {
          const err = new Error(`LCD query error: ${response.status} ${response.statusText}`);
          if (response.status === 429) {
            this.markEndpointUnhealthy(endpoint);
          }
          throw err;
        }

        const result = await response.json();
        // LCD response wraps data in { data: ... }
        return result.data as T;
      } catch (error) {
        // Mark endpoint as unhealthy and try next — no tight retry on the same host
        this.markEndpointUnhealthy(endpoint);
        lastError = error instanceof Error ? error : new Error(String(error));
        // Continue to next endpoint
      }
    }
    
    // All endpoints failed
    throw lastError ?? new Error('All LCD endpoints failed');
  }
}

export const priceService = new PriceService();
export { PriceService };