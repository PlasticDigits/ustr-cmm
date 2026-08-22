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
  /** `lp` = allowlisted protocol pair share (#14). Default spot token. */
  kind?: 'spot' | 'lp';
  /** Full reserve NAV USD for display. null = unpriced / failed pool. */
  displayUsd?: number | null;
  /** CR numerator USD (wrap legs haircut). null = omit from CR. */
  crUsd?: number | null;
  /** Wrap symbols shown in NAV but excluded from CR. */
  haircutLegs?: string[];
  pairLabel?: string;
  /** Both sides of an LP pair, used for overlapping icons. */
  pairSymbols?: [string, string];
  /** Pair or LP contract for finder (pinned). */
  explorerAddress?: string;
  navIncomplete?: boolean;
  /** LP share / pool total_share for display (0–1). */
  poolShare?: number | null;
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
 *
 * collateralization / ustcPerUst1 / assetsToLiabilities:
 * - Infinity only when UST1 token_info succeeded and total_supply === 0
 * - NaN when UST1 supply is unknown (query failed) or CR cannot be computed
 * - finite percent / multiple when supply > 0
 */
export interface TreasuryRatios {
  /** Collateralization percentage (e.g., 150 means 150% backed). NaN → N/A, Infinity → ∞ */
  collateralization: number;
  /** USTC backing per UST1 token */
  ustcPerUst1: number;
  /** Total priced assets USD / outstanding UST1 (same ratio as CR, shown as × not %) */
  assetsToLiabilities: number;
  /** Assets backing per USTR token */
  ustrBacking: number;
  /** True when some non-zero treasury balances were omitted from the CR numerator */
  incomplete: boolean;
  /** Symbols that entered assetsUsd */
  includedSymbols: string[];
  /** Non-zero balances without a valid USD price */
  missingPriceSymbols: string[];
  /** UST1 supply query outcome */
  ust1SupplyStatus: 'zero' | 'positive' | 'unknown';
}

/**
 * Complete treasury data structure containing all assets, issuances, and ratios
 */
export interface TreasuryData {
  /** Assets in the treasury keyed by denomination */
  assets: Record<string, TreasuryAsset>;
  /** UST1 token issuance metrics (circulating = CW20 total_supply) */
  ust1Issuance: TokenIssuance;
  /** USTR token issuance metrics */
  ustrIssuance: TokenIssuance;
  /** Wrap-token outstanding supply (informational — not CR collateral) */
  cLuncIssuance: TokenIssuance | null;
  cUstcIssuance: TokenIssuance | null;
  /** True when minted/burned are not lifetime counters (CW20 has no cumulative mint/burn) */
  issuanceLifetimeUnknown: boolean;
  /** Financial ratios and health metrics */
  ratios: TreasuryRatios;
  /** Timestamp when the data was last updated */
  lastUpdated: Date;
}