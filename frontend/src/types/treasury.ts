/**
 * Treasury data types for USTR CMM
 *
 * These types define the structure of treasury balance data, token issuance metrics,
 * and financial ratios for the treasury contract.
 */

import type { CrColorTier } from '../utils/crTiers';

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
  /** Full reserve NAV USD for display (may include protocol legs). null = unpriced / failed pool. */
  displayUsd?: number | null;
  /** CR numerator USD (`other` legs only). null = omit from CR / fail closed. */
  crUsd?: number | null;
  /** Protocol / wrap symbols shown in NAV but excluded from CR (#16). */
  haircutLegs?: string[];
  /** Unpriced legs when NAV is incomplete (e.g. CL8Y-cb if USD missing). */
  missingPriceLegs?: string[];
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
 * Outstanding vs CMM-owned vs available supply (#16).
 * CW20 has no lifetime mint/burn counters — do not invent burned.
 */
export interface TokenIssuance {
  /** CW20 `token_info.total_supply` */
  outstanding: bigint;
  /** Treasury spot + allowlisted LP claims */
  cmmOwned: bigint;
  /** outstanding − cmmOwned (clamped to 0 when uncertified) */
  availableSupply: bigint;
  /** False when outstanding, spot, or LP claims could not be certified */
  inventoryKnown: boolean;
}

/**
 * Financial ratios for treasury health metrics
 *
 * collateralization / ustcPerUst1 / assetsToLiabilities:
 * - Infinity only when UST1 available-supply queries succeeded and available === 0
 * - NaN when available supply is unknown or CR cannot be certified
 * - finite percent / multiple when available > 0 and every CR price is present
 */
export interface TreasuryRatios {
  /** Collateralization percentage (e.g., 150 means 150% backed). NaN → hidden, Infinity → ∞ */
  collateralization: number;
  /** Native USTC per **available** UST1 */
  ustcPerUst1: number;
  /** Priced non-protocol assets USD / available UST1 (same ratio as CR, shown as × not %) */
  assetsToLiabilities: number;
  /** True when a CR-relevant price or inventory input is missing */
  incomplete: boolean;
  /** True only when available supply is known and every CR-relevant price is present */
  pricesReady: boolean;
  /** Symbols that entered assetsUsd */
  includedSymbols: string[];
  /** Non-zero CR-relevant balances without a valid USD price */
  missingPriceSymbols: string[];
  /** UST1 available-supply query outcome */
  ust1SupplyStatus: 'zero' | 'positive' | 'unknown';
  /** Named ECONOMICS band; null when prices are not ready */
  tier: CrColorTier | null;
}

/**
 * Complete treasury data structure containing all assets, issuances, and ratios
 */
export interface TreasuryData {
  /** Assets in the treasury keyed by denomination (raw protocol tokens never appear) */
  assets: Record<string, TreasuryAsset>;
  ust1Issuance: TokenIssuance;
  ustrIssuance: TokenIssuance;
  cLuncIssuance: TokenIssuance | null;
  cUstcIssuance: TokenIssuance | null;
  ratios: TreasuryRatios;
  lastUpdated: Date;
}
