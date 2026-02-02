/**
 * Price data types for USTR CMM
 * 
 * These types define the structure of price data and DEX interaction
 * interfaces for fetching token prices and performing swap simulations.
 */

/**
 * Represents the price of a single token
 */
export interface TokenPrice {
  /** Token symbol (e.g., 'LUNC', 'USTC', 'ALPHA') */
  symbol: string;
  /** Price in USD */
  usdPrice: number;
  /** Source of the price data */
  source: 'binance' | 'garuda' | 'terraswap' | 'custom' | 'calculated';
  /** Timestamp when the price was fetched */
  lastUpdated: Date;
}

/**
 * Complete price data structure
 */
export interface PriceData {
  /** Token prices keyed by symbol */
  prices: Record<string, TokenPrice>;
  /** LUNC price in USD (base price) */
  luncUsd: number;
  /** USTC price in USD (base price) */
  ustcUsd: number;
  /** Loading state indicator */
  isLoading: boolean;
  /** Error message if price fetching failed */
  error: string | null;
  /** Timestamp when the data was last updated */
  lastUpdated: Date;
}

/**
 * DEX configuration for a specific router
 */
export interface DexConfig {
  /** Factory contract address (null if not available) */
  factory: string | null;
  /** Router contract address (null if not available) */
  router: string | null;
}

/**
 * DEX router configurations
 */
export interface DexRouters {
  /** Placeholder for future USTR DEX */
  custom: DexConfig | null;
  /** Garuda Defi contracts configuration */
  garuda: DexConfig;
  /** Terraswap contracts configuration */
  terraswap: DexConfig;
}

/**
 * Result of a swap simulation
 */
export interface SwapSimulationResult {
  /** Amount returned from the swap */
  returnAmount: string;
  /** Spread or slippage amount */
  spreadAmount: string;
  /** Commission amount taken */
  commissionAmount: string;
}

/**
 * Information about a Garuda pair contract
 */
export interface GarudaPairInfo {
  /** First asset in the pair */
  asset1: { cw20: string } | { native: string };
  /** Second asset in the pair */
  asset2: { cw20: string } | { native: string };
  /** Pair contract address */
  contract: string;
}