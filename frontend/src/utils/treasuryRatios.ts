/**
 * Treasury key-ratio math (#11 / #16, Total vs CR CMM assets & liabilities).
 *
 * Invariants:
 * - Total CMM Assets = every priced holding, including protocol issued tokens
 *   (UST1, USTR, cLUNC, cUSTC) held spot or in CMM LP (`displayUsd` / full NAV).
 * - CR CMM Assets = Total minus those protocol issued tokens. Spot non-protocol
 *   USD + LP `other` NAV (`crUsd`). Native LUNC/USTC still count.
 * - Total Liabilities = outstanding UST1 ($1 debt) + cUSTC (USTC USD debt) +
 *   cLUNC (LUNC USD debt). USTR is equity (no redemption promise) and is not
 *   a liability.
 * - CR CMM Liabilities = those minus CMM-owned (spot + allowlisted LP claims),
 *   i.e. available supply × the same unit prices. USTR is omitted.
 * - CR% and Assets/Liabilities use CR CMM Assets / CR CMM Liabilities.
 * - ∞ only when CR liabilities are certified and === 0. Inventory / price
 *   failure → NaN, never ∞.
 * - Missing USD is omitted and flagged incomplete — never treated as $0 or $1.
 * - $0 CR numerator with no missing CR prices is a valid complete CR (0% / RED).
 */

import { crColorTier, type CrColorTier } from './crTiers';
import { isValidPositivePrice, rawToWholeNumber } from './decimals';

export type Ust1SupplyStatus = 'zero' | 'positive' | 'unknown';
export type LiabilityStatus = 'zero' | 'positive' | 'unknown';

export interface RatioAssetInput {
  symbol: string;
  balanceRaw: bigint;
  decimals: number;
  /**
   * When set, CR uses this USD instead of `balance * prices[symbol]`.
   * `null` = known-incomplete (omit + flag). `undefined` = spot price path.
   */
  crUsd?: number | null;
  /**
   * When set, Total CMM Assets uses this USD instead of the spot price path.
   * `null` = known-incomplete for Total only. `undefined` = same path as CR
   * (non-protocol spot).
   */
  displayUsd?: number | null;
}

export interface ProtocolLiabilityInput {
  /** Display / missing-price label (UST1, cLUNC, cUSTC). USTR is skipped. */
  label: string;
  /**
   * `null` together with `inventoryKnown === false` and no availableRaw = not
   * launched (skip). Otherwise CW20 outstanding.
   */
  outstandingRaw: bigint | null;
  /** `null` when available supply could not be certified. */
  availableRaw: bigint | null;
  inventoryKnown: boolean;
  decimals: number;
  /** Unit USD. `null` if unpriced. */
  usd: number | null;
}

export interface ComputeTreasuryRatiosArgs {
  /** null = token_info failed, CMM-owned unknown, or available could not be certified */
  ust1AvailableRaw: bigint | null;
  ust1Decimals: number;
  ustcBalanceRaw: bigint;
  ustcDecimals: number;
  assets: RatioAssetInput[];
  prices: Record<string, number>;
  liabilities: ProtocolLiabilityInput[];
}

export interface ComputedTreasuryRatios {
  collateralization: number;
  ustcPerUst1: number;
  assetsToLiabilities: number;
  totalAssetsUsd: number;
  crAssetsUsd: number;
  totalLiabilitiesUsd: number;
  crLiabilitiesUsd: number;
  incomplete: boolean;
  totalIncomplete: boolean;
  pricesReady: boolean;
  includedSymbols: string[];
  missingPriceSymbols: string[];
  ust1SupplyStatus: Ust1SupplyStatus;
  liabilityStatus: LiabilityStatus;
  tier: CrColorTier | null;
}

const NA = Number.NaN;

function finish(base: Omit<ComputedTreasuryRatios, 'tier' | 'pricesReady'>): ComputedTreasuryRatios {
  const pricesReady = !base.incomplete && base.liabilityStatus !== 'unknown';
  return {
    ...base,
    pricesReady,
    tier: pricesReady ? crColorTier(base.collateralization) : null,
  };
}

function classifyAmount(raw: bigint | null, decimals: number): Ust1SupplyStatus {
  if (raw === null) return 'unknown';
  const whole = rawToWholeNumber(raw, decimals);
  if (!Number.isFinite(whole) || whole < 0) return 'unknown';
  return whole === 0 ? 'zero' : 'positive';
}

function uniqueSymbols(symbols: string[]): string[] {
  return [...new Set(symbols)];
}

export function computeTreasuryRatios(args: ComputeTreasuryRatiosArgs): ComputedTreasuryRatios {
  const {
    ust1AvailableRaw,
    ust1Decimals,
    ustcBalanceRaw,
    ustcDecimals,
    assets,
    prices,
    liabilities,
  } = args;

  const crSum = sumCrNumerator(assets, prices);
  const totalSum = sumTotalAssets(assets, prices);
  const liab = sumProtocolLiabilities(liabilities);

  const ust1SupplyStatus = classifyAmount(ust1AvailableRaw, ust1Decimals);
  const wholeUstc = rawToWholeNumber(ustcBalanceRaw, ustcDecimals);
  const wholeUst1 =
    ust1AvailableRaw === null ? NA : rawToWholeNumber(ust1AvailableRaw, ust1Decimals);
  const ustcPerUst1 =
    ust1SupplyStatus === 'unknown' || !Number.isFinite(wholeUst1) || wholeUst1 < 0
      ? NA
      : wholeUst1 === 0
        ? Number.POSITIVE_INFINITY
        : Number.isFinite(wholeUstc)
          ? wholeUstc / wholeUst1
          : NA;

  const crIncomplete = crSum.missingPriceSymbols.length > 0 || !crSum.pricedOk;
  const totalIncomplete = totalSum.missingPriceSymbols.length > 0 || !totalSum.pricedOk;
  const missingPriceSymbols = uniqueSymbols([
    ...crSum.missingPriceSymbols,
    ...totalSum.missingPriceSymbols,
    ...liab.missingPriceSymbols,
  ]);

  const crAssetsUsd = crIncomplete ? NA : crSum.assetsUsd;
  const totalAssetsUsd = totalIncomplete ? NA : totalSum.assetsUsd;
  const totalLiabilitiesUsd = liab.totalUsd ?? NA;
  const crLiabilitiesUsd = liab.crUsd ?? NA;
  const liabilityStatus: LiabilityStatus =
    liab.status === 'unknown' || ust1SupplyStatus === 'unknown' ? 'unknown' : liab.status;

  if (liabilityStatus === 'unknown') {
    return finish({
      collateralization: NA,
      ustcPerUst1,
      assetsToLiabilities: NA,
      totalAssetsUsd,
      crAssetsUsd,
      totalLiabilitiesUsd,
      crLiabilitiesUsd,
      incomplete: true,
      totalIncomplete,
      includedSymbols: crSum.includedSymbols,
      missingPriceSymbols,
      ust1SupplyStatus,
      liabilityStatus,
    });
  }

  if (liabilityStatus === 'zero') {
    return finish({
      collateralization: Number.POSITIVE_INFINITY,
      ustcPerUst1,
      assetsToLiabilities: Number.POSITIVE_INFINITY,
      totalAssetsUsd,
      crAssetsUsd,
      totalLiabilitiesUsd,
      crLiabilitiesUsd: 0,
      incomplete: crIncomplete,
      totalIncomplete,
      includedSymbols: crSum.includedSymbols,
      missingPriceSymbols,
      ust1SupplyStatus,
      liabilityStatus: 'zero',
    });
  }

  if (crIncomplete || !Number.isFinite(crSum.assetsUsd) || liab.crUsd === null) {
    return finish({
      collateralization: NA,
      ustcPerUst1,
      assetsToLiabilities: NA,
      totalAssetsUsd,
      crAssetsUsd,
      totalLiabilitiesUsd,
      crLiabilitiesUsd,
      incomplete: true,
      totalIncomplete,
      includedSymbols: crSum.includedSymbols,
      missingPriceSymbols,
      ust1SupplyStatus,
      liabilityStatus,
    });
  }

  return finish({
    collateralization: (crSum.assetsUsd / liab.crUsd!) * 100,
    ustcPerUst1,
    assetsToLiabilities: crSum.assetsUsd / liab.crUsd!,
    totalAssetsUsd,
    crAssetsUsd: crSum.assetsUsd,
    totalLiabilitiesUsd,
    crLiabilitiesUsd: liab.crUsd!,
    incomplete: false,
    totalIncomplete,
    includedSymbols: crSum.includedSymbols,
    missingPriceSymbols,
    ust1SupplyStatus,
    liabilityStatus: 'positive',
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
    const priced = spotUsd(asset, prices);
    if (priced === null) {
      missingPriceSymbols.push(asset.symbol);
      continue;
    }
    assetsUsd += priced;
    includedSymbols.push(asset.symbol);
  }

  return {
    includedSymbols,
    missingPriceSymbols,
    assetsUsd,
    pricedOk: Number.isFinite(assetsUsd) && assetsUsd >= 0,
  };
}

function sumTotalAssets(
  assets: RatioAssetInput[],
  prices: Record<string, number>
): {
  missingPriceSymbols: string[];
  assetsUsd: number;
  pricedOk: boolean;
} {
  const missingPriceSymbols: string[] = [];
  let assetsUsd = 0;

  for (const asset of assets) {
    if (asset.displayUsd === undefined && asset.crUsd === undefined && asset.balanceRaw <= 0n) {
      continue;
    }

    if (asset.displayUsd === null) {
      missingPriceSymbols.push(asset.symbol);
      continue;
    }
    if (typeof asset.displayUsd === 'number') {
      if (!Number.isFinite(asset.displayUsd) || asset.displayUsd < 0) {
        if (asset.balanceRaw > 0n) missingPriceSymbols.push(asset.symbol);
        continue;
      }
      assetsUsd += asset.displayUsd;
      continue;
    }

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
      continue;
    }

    if (asset.balanceRaw <= 0n) continue;
    const priced = spotUsd(asset, prices);
    if (priced === null) {
      missingPriceSymbols.push(asset.symbol);
      continue;
    }
    assetsUsd += priced;
  }

  return {
    missingPriceSymbols,
    assetsUsd,
    pricedOk: Number.isFinite(assetsUsd) && assetsUsd >= 0,
  };
}

function spotUsd(asset: RatioAssetInput, prices: Record<string, number>): number | null {
  const whole = rawToWholeNumber(asset.balanceRaw, asset.decimals);
  const price = prices[asset.symbol];
  if (!Number.isFinite(whole) || whole < 0) return null;
  if (!isValidPositivePrice(price)) return null;
  const usd = whole * price;
  return Number.isFinite(usd) && usd >= 0 ? usd : null;
}

/**
 * Skip not-launched wraps (`outstandingRaw === null` and `inventoryKnown === false`
 * with no available figure). Any launched token with unknown inventory fail-closes.
 */
export function sumProtocolLiabilities(items: ProtocolLiabilityInput[]): {
  totalUsd: number | null;
  crUsd: number | null;
  status: LiabilityStatus;
  missingPriceSymbols: string[];
} {
  const missingPriceSymbols: string[] = [];
  let totalUsd = 0;
  let crUsd = 0;
  let unknown = false;
  let anyPositiveCr = false;

  for (const item of items) {
    // USTR is equity, not a redeemable claim — never count against CR / totals.
    if (item.label === 'USTR') continue;
    const skipped =
      !item.inventoryKnown && item.outstandingRaw === null && item.availableRaw === null;
    if (skipped) continue;

    if (!item.inventoryKnown || item.outstandingRaw === null || item.availableRaw === null) {
      unknown = true;
      continue;
    }
    if (item.outstandingRaw < 0n || item.availableRaw < 0n) {
      unknown = true;
      continue;
    }

    const outstandingWhole = rawToWholeNumber(item.outstandingRaw, item.decimals);
    const availableWhole = rawToWholeNumber(item.availableRaw, item.decimals);
    if (
      !Number.isFinite(outstandingWhole) ||
      outstandingWhole < 0 ||
      !Number.isFinite(availableWhole) ||
      availableWhole < 0
    ) {
      unknown = true;
      continue;
    }

    const needsPrice = outstandingWhole > 0 || availableWhole > 0;
    if (needsPrice && !isValidPositivePrice(item.usd)) {
      missingPriceSymbols.push(item.label);
      continue;
    }
    if (!needsPrice) continue;

    const unit = item.usd as number;
    totalUsd += outstandingWhole * unit;
    crUsd += availableWhole * unit;
    if (availableWhole > 0) anyPositiveCr = true;
  }

  if (unknown || missingPriceSymbols.length > 0) {
    return {
      totalUsd: null,
      crUsd: null,
      status: 'unknown',
      missingPriceSymbols,
    };
  }

  if (!Number.isFinite(totalUsd) || totalUsd < 0 || !Number.isFinite(crUsd) || crUsd < 0) {
    return { totalUsd: null, crUsd: null, status: 'unknown', missingPriceSymbols };
  }

  return {
    totalUsd,
    crUsd,
    status: anyPositiveCr || crUsd > 0 ? 'positive' : 'zero',
    missingPriceSymbols,
  };
}
