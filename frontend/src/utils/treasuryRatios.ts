/**
 * Treasury key-ratio math (#11).
 *
 * Invariants:
 * - CR denominator is UST1 CW20 `token_info.total_supply` (outstanding), never USTR, never window volume.
 * - ∞ only when UST1 query succeeded and outstanding === 0. Query failure → NaN (UI: N/A), never ∞.
 * - When supply > 0, compute — never return the stub 0.
 * - 1 UST1 = $1 liability. collateralization% = (priced assets USD / whole UST1) * 100.
 * - Do not count cLUNC/cUSTC or UST1 as assets (wraps double-count native; UST1 is the liability).
 * - Missing USD is omitted from the sum and flagged incomplete — never treated as $0 or $1.
 */

import { isValidPositivePrice, rawToWholeNumber } from './decimals';

export type Ust1SupplyStatus = 'zero' | 'positive' | 'unknown';

export interface RatioAssetInput {
  symbol: string;
  balanceRaw: bigint;
  decimals: number;
}

export interface ComputeTreasuryRatiosArgs {
  /** null = token_info failed or address unset */
  ust1SupplyRaw: bigint | null;
  ust1Decimals: number;
  ustcBalanceRaw: bigint;
  ustcDecimals: number;
  assets: RatioAssetInput[];
  prices: Record<string, number>;
  ustrBacking: number;
}

export interface ComputedTreasuryRatios {
  collateralization: number;
  ustcPerUst1: number;
  assetsToLiabilities: number;
  ustrBacking: number;
  incomplete: boolean;
  includedSymbols: string[];
  missingPriceSymbols: string[];
  ust1SupplyStatus: Ust1SupplyStatus;
}

const NA = Number.NaN;

export function computeTreasuryRatios(args: ComputeTreasuryRatiosArgs): ComputedTreasuryRatios {
  const {
    ust1SupplyRaw,
    ust1Decimals,
    ustcBalanceRaw,
    ustcDecimals,
    assets,
    prices,
    ustrBacking,
  } = args;

  if (ust1SupplyRaw === null) {
    return {
      collateralization: NA,
      ustcPerUst1: NA,
      assetsToLiabilities: NA,
      ustrBacking,
      incomplete: true,
      includedSymbols: [],
      missingPriceSymbols: symbolsMissingPrice(assets, prices),
      ust1SupplyStatus: 'unknown',
    };
  }

  const wholeUst1 = rawToWholeNumber(ust1SupplyRaw, ust1Decimals);
  if (!Number.isFinite(wholeUst1) || wholeUst1 < 0) {
    return {
      collateralization: NA,
      ustcPerUst1: NA,
      assetsToLiabilities: NA,
      ustrBacking,
      incomplete: true,
      includedSymbols: [],
      missingPriceSymbols: symbolsMissingPrice(assets, prices),
      ust1SupplyStatus: 'unknown',
    };
  }

  if (wholeUst1 === 0) {
    return {
      collateralization: Number.POSITIVE_INFINITY,
      ustcPerUst1: Number.POSITIVE_INFINITY,
      assetsToLiabilities: Number.POSITIVE_INFINITY,
      ustrBacking,
      incomplete: false,
      includedSymbols: [],
      missingPriceSymbols: [],
      ust1SupplyStatus: 'zero',
    };
  }

  const includedSymbols: string[] = [];
  const missingPriceSymbols: string[] = [];
  let assetsUsd = 0;
  let pricedCount = 0;

  for (const asset of assets) {
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
    pricedCount += 1;
  }

  const incomplete = missingPriceSymbols.length > 0 || pricedCount === 0;
  const wholeUstc = rawToWholeNumber(ustcBalanceRaw, ustcDecimals);
  const ustcPerUst1 = Number.isFinite(wholeUstc) ? wholeUstc / wholeUst1 : NA;

  if (pricedCount === 0 || !Number.isFinite(assetsUsd)) {
    return {
      collateralization: NA,
      ustcPerUst1,
      assetsToLiabilities: NA,
      ustrBacking,
      incomplete: true,
      includedSymbols,
      missingPriceSymbols,
      ust1SupplyStatus: 'positive',
    };
  }

  return {
    collateralization: (assetsUsd / wholeUst1) * 100,
    ustcPerUst1,
    assetsToLiabilities: assetsUsd / wholeUst1,
    ustrBacking,
    incomplete,
    includedSymbols,
    missingPriceSymbols,
    ust1SupplyStatus: 'positive',
  };
}

function symbolsMissingPrice(assets: RatioAssetInput[], prices: Record<string, number>): string[] {
  return assets
    .filter((asset) => asset.balanceRaw > 0n && !isValidPositivePrice(prices[asset.symbol]))
    .map((asset) => asset.symbol);
}
