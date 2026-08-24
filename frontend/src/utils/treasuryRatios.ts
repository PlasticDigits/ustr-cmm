/**
 * Treasury key-ratio math (#11, denominator + numerator revised by #16).
 *
 * Invariants:
 * - CR denominator is UST1 **available supply** (outstanding − CMM-owned), never raw
 *   `total_supply`, never USTR, never window volume.
 * - ∞ only when available-supply queries succeeded and available === 0. Query /
 *   inventory failure → NaN, never ∞.
 * - Numerator = priced non-protocol spot USD + LP `other` NAV (`crUsd`). UST1 / USTR /
 *   wrap legs are not assets.
 * - 1 UST1 = $1 liability unit for the ratio only. Do not put UST1 in the numerator.
 * - Missing USD is omitted and flagged incomplete — never treated as $0 or $1.
 * - $0 numerator with no missing CR prices is a valid complete CR (0% / RED).
 */

import { crColorTier, type CrColorTier } from './crTiers';
import { isValidPositivePrice, rawToWholeNumber } from './decimals';

export type Ust1SupplyStatus = 'zero' | 'positive' | 'unknown';

export interface RatioAssetInput {
  symbol: string;
  balanceRaw: bigint;
  decimals: number;
  /**
   * When set, CR uses this USD instead of `balance * prices[symbol]`.
   * `null` = known-incomplete (omit + flag). `undefined` = spot price path.
   */
  crUsd?: number | null;
}

export interface ComputeTreasuryRatiosArgs {
  /** null = token_info failed, CMM-owned unknown, or available could not be certified */
  ust1AvailableRaw: bigint | null;
  ust1Decimals: number;
  ustcBalanceRaw: bigint;
  ustcDecimals: number;
  assets: RatioAssetInput[];
  prices: Record<string, number>;
}

export interface ComputedTreasuryRatios {
  collateralization: number;
  ustcPerUst1: number;
  assetsToLiabilities: number;
  incomplete: boolean;
  pricesReady: boolean;
  includedSymbols: string[];
  missingPriceSymbols: string[];
  ust1SupplyStatus: Ust1SupplyStatus;
  tier: CrColorTier | null;
}

const NA = Number.NaN;

function withTier(base: Omit<ComputedTreasuryRatios, 'tier' | 'pricesReady'>): ComputedTreasuryRatios {
  const pricesReady = !base.incomplete && base.ust1SupplyStatus !== 'unknown';
  return {
    ...base,
    pricesReady,
    tier: pricesReady ? crColorTier(base.collateralization) : null,
  };
}

export function computeTreasuryRatios(args: ComputeTreasuryRatiosArgs): ComputedTreasuryRatios {
  const {
    ust1AvailableRaw,
    ust1Decimals,
    ustcBalanceRaw,
    ustcDecimals,
    assets,
    prices,
  } = args;

  if (ust1AvailableRaw === null) {
    return withTier({
      collateralization: NA,
      ustcPerUst1: NA,
      assetsToLiabilities: NA,
      incomplete: true,
      includedSymbols: [],
      missingPriceSymbols: symbolsMissingPrice(assets, prices),
      ust1SupplyStatus: 'unknown',
    });
  }

  const wholeUst1 = rawToWholeNumber(ust1AvailableRaw, ust1Decimals);
  if (!Number.isFinite(wholeUst1) || wholeUst1 < 0) {
    return withTier({
      collateralization: NA,
      ustcPerUst1: NA,
      assetsToLiabilities: NA,
      incomplete: true,
      includedSymbols: [],
      missingPriceSymbols: symbolsMissingPrice(assets, prices),
      ust1SupplyStatus: 'unknown',
    });
  }

  const { includedSymbols, missingPriceSymbols, assetsUsd, pricedOk } = sumCrNumerator(assets, prices);
  const incomplete = missingPriceSymbols.length > 0 || !pricedOk;

  if (wholeUst1 === 0) {
    return withTier({
      collateralization: Number.POSITIVE_INFINITY,
      ustcPerUst1: Number.POSITIVE_INFINITY,
      assetsToLiabilities: Number.POSITIVE_INFINITY,
      incomplete,
      includedSymbols,
      missingPriceSymbols,
      ust1SupplyStatus: 'zero',
    });
  }

  const wholeUstc = rawToWholeNumber(ustcBalanceRaw, ustcDecimals);
  const ustcPerUst1 = Number.isFinite(wholeUstc) ? wholeUstc / wholeUst1 : NA;

  if (incomplete || !Number.isFinite(assetsUsd)) {
    return withTier({
      collateralization: NA,
      ustcPerUst1,
      assetsToLiabilities: NA,
      incomplete: true,
      includedSymbols,
      missingPriceSymbols,
      ust1SupplyStatus: 'positive',
    });
  }

  return withTier({
    collateralization: (assetsUsd / wholeUst1) * 100,
    ustcPerUst1,
    assetsToLiabilities: assetsUsd / wholeUst1,
    incomplete: false,
    includedSymbols,
    missingPriceSymbols,
    ust1SupplyStatus: 'positive',
  });
}

function sumCrNumerator(
  assets: RatioAssetInput[],
  prices: Record<string, number>
): {
  includedSymbols: string[];
  missingPriceSymbols: string[];
  assetsUsd: number;
  pricedOk: boolean;
} {
  const includedSymbols: string[] = [];
  const missingPriceSymbols: string[] = [];
  let assetsUsd = 0;

  for (const asset of assets) {
    if (asset.crUsd === undefined && asset.balanceRaw <= 0n) continue;

    if (asset.crUsd === null) {
      missingPriceSymbols.push(asset.symbol);
      continue;
    }
    if (typeof asset.crUsd === 'number') {
      if (!Number.isFinite(asset.crUsd) || asset.crUsd < 0) {
        if (asset.balanceRaw > 0n) missingPriceSymbols.push(asset.symbol);
        continue;
      }
      assetsUsd += asset.crUsd;
      if (asset.crUsd > 0) includedSymbols.push(asset.symbol);
      continue;
    }

    if (asset.balanceRaw <= 0n) continue;
    const whole = rawToWholeNumber(asset.balanceRaw, asset.decimals);
    const price = prices[asset.symbol];
    if (!Number.isFinite(whole) || whole < 0) {
      missingPriceSymbols.push(asset.symbol);
      continue;
    }
    if (!isValidPositivePrice(price)) {
      missingPriceSymbols.push(asset.symbol);
      continue;
    }
    assetsUsd += whole * price;
    includedSymbols.push(asset.symbol);
  }

  return {
    includedSymbols,
    missingPriceSymbols,
    assetsUsd,
    pricedOk: Number.isFinite(assetsUsd) && assetsUsd >= 0,
  };
}

function symbolsMissingPrice(assets: RatioAssetInput[], prices: Record<string, number>): string[] {
  return assets
    .filter((asset) => {
      if (asset.balanceRaw <= 0n && asset.crUsd === undefined) return false;
      if (asset.crUsd === null) return true;
      if (typeof asset.crUsd === 'number') return !Number.isFinite(asset.crUsd) || asset.crUsd < 0;
      return asset.balanceRaw > 0n && !isValidPositivePrice(prices[asset.symbol]);
    })
    .map((asset) => asset.symbol);
}
