/**
 * Treasury data types for USTR CMM
 * 
 * These types define the structure of treasury balance data, token issuance metrics,
 * and financial ratios for the treasury contract.
 */

/**
 * Represents an asset in the treasury with balance and display information
 */
export interface TreasuryAsset {
  /** Asset denomination (e.g., 'ustc', 'alpha') */
  denom: string;
  /** Raw balance in smallest unit */
  balance: bigint;
  /** Decimal places for display formatting */
  decimals: number;
  /** Human readable name (e.g., 'USTC', 'ALPHA') */
  displayName: string;
  /** Tailwind gradient classes for visual styling */
  gradient: string;
  /** Tailwind text color class for the icon */
  iconColor: string;
}

/**
 * Token issuance metrics tracking minted, burned, and circulating supply
 */
export interface TokenIssuance {
  /** Total tokens minted */
  minted: bigint;
  /** Total tokens burned */
  burned: bigint;
  /** Circulating supply (minted - burned) */
  supply: bigint;
}

/**
 * Financial ratios for treasury health metrics
 */
export interface TreasuryRatios {
  /** Collateralization percentage (e.g., 150 means 150% backed) */
  collateralization: number;
  /** USTC backing per UST1 token */
  ustcPerUst1: number;
  /** Total assets to total liabilities ratio */
  assetsToLiabilities: number;
  /** Assets backing per USTR token */
  ustrBacking: number;
}

/**
 * Complete treasury data structure containing all assets, issuances, and ratios
 */
export interface TreasuryData {
  /** Assets in the treasury keyed by denomination */
  assets: Record<string, TreasuryAsset>;
  /** UST1 token issuance metrics */
  ust1Issuance: TokenIssuance;
  /** USTR token issuance metrics */
  ustrIssuance: TokenIssuance;
  /** Financial ratios and health metrics */
  ratios: TreasuryRatios;
  /** Timestamp when the data was last updated */
  lastUpdated: Date;
}