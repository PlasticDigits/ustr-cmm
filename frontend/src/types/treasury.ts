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
  /** True for UST1 / USTR / cLUNC / cUSTC spot rows (Total only, omitted from CR). */
  protocolIssued?: boolean;
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
 * collateralization / assetsToLiabilities:
 * - CR CMM Assets / CR CMM Liabilities
 * - Infinity only when CR liabilities are certified and === 0
 * - NaN when inventory is unknown or CR cannot be certified
 *
 * Total CMM Assets include protocol issued tokens held by CMM (spot + LP).
 * CR CMM Assets omit those. Total / CR liabilities are outstanding vs available
 * of UST1 + cUSTC + cLUNC (debt) and USTR (equity).
 */
export interface TreasuryRatios {
  /** Collateralization percentage (e.g., 150 means 150% backed). NaN → hidden, Infinity → ∞ */
  collateralization: number;
  /** Native USTC per **available** UST1 */
  ustcPerUst1: number;
  /** CR CMM Assets / CR CMM Liabilities (same ratio as CR, shown as × not %) */
  assetsToLiabilities: number;
  /** All priced holdings including protocol issued tokens held by CMM / CMM LP */
  totalAssetsUsd: number;
  /** Holdings minus protocol issued tokens held by CMM / CMM LP */
  crAssetsUsd: number;
  /** Outstanding UST1 + cUSTC + cLUNC (debt) + USTR (equity) */
  totalLiabilitiesUsd: number;
  /** Available supply of those same liabilities (outstanding − CMM-owned) */
  crLiabilitiesUsd: number;
  /** True when a CR-relevant price or inventory input is missing */
  incomplete: boolean;
  /** True when Total CMM Assets could not be fully priced */
  totalIncomplete: boolean;
  /** True only when CR liabilities are known and every CR-relevant price is present */
  pricesReady: boolean;
  /** Symbols that entered CR assets */
  includedSymbols: string[];
  /** Non-zero CR/Total-relevant balances without a valid USD price */
  missingPriceSymbols: string[];
  /** UST1 available-supply query outcome (USTC-per-UST1) */
  ust1SupplyStatus: 'zero' | 'positive' | 'unknown';
  /** CR CMM Liabilities certified outcome */
  liabilityStatus: 'zero' | 'positive' | 'unknown';
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
