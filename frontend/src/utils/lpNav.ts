/**
 * Reserve NAV for treasury LP shares (#14).
 *
 * share claim_i = floor(reserve_i * lp_balance / total_share)
 * displayUsd    = Σ claim_i * usd_i   (all priced legs)
 * crUsd         = Σ claim_i * usd_i   for CR-eligible legs only
 *
 * Fail closed: total_share == 0, lp_balance > total_share, non-finite wholes.
 * Unpriced CR-eligible leg → crUsd = null (omit from CR). Never treat missing USD as $0 or $1.
 */

import { isValidPositivePrice, rawToWholeNumber } from './decimals';
import { isCrEligibleLeg, type LpLegKind } from './lpEligibility';

export interface LpNavLegInput {
  symbol: string;
  amountRaw: bigint;
  decimals: number;
  kind: LpLegKind;
  usd: number | null;
}

export interface ComputeLpNavArgs {
  lpBalance: bigint;
  totalShare: bigint;
  legs: LpNavLegInput[];
}

export type LpNavFailReason =
  | 'zero-share'
  | 'zero-balance'
  | 'over-share'
  | 'bad-legs'
  | 'bad-reserve'
  | 'unpriced-cr-leg';

export interface LpNavResult {
  ok: boolean;
  displayUsd: number | null;
  crUsd: number | null;
  includedLegs: string[];
  haircutLegs: string[];
  missingPriceLegs: string[];
  incomplete: boolean;
  reason?: LpNavFailReason;
}

function fail(reason: LpNavFailReason, extra?: Partial<LpNavResult>): LpNavResult {
  return {
    ok: false,
    displayUsd: null,
    crUsd: null,
    includedLegs: [],
    haircutLegs: extra?.haircutLegs ?? [],
    missingPriceLegs: extra?.missingPriceLegs ?? [],
    incomplete: true,
    reason,
  };
}

export function computeLpNav(args: ComputeLpNavArgs): LpNavResult {
  const { lpBalance, totalShare, legs } = args;

  if (totalShare <= 0n) {
    return fail('zero-share');
  }
  if (lpBalance < 0n) {
    return fail('bad-reserve');
  }
  if (lpBalance === 0n) {
    return {
      ok: true,
      displayUsd: 0,
      crUsd: 0,
      includedLegs: [],
      haircutLegs: [],
      missingPriceLegs: [],
      incomplete: false,
      reason: 'zero-balance',
    };
  }
  if (lpBalance > totalShare) {
    return fail('over-share');
  }
  if (legs.length !== 2) {
    return fail('bad-legs');
  }

  let displayUsd = 0;
  let crUsd = 0;
  let displayPriced = 0;
  const includedLegs: string[] = [];
  const haircutLegs: string[] = [];
  const missingPriceLegs: string[] = [];
  let crEligibleCount = 0;
  let crPricedCount = 0;
  let crUnpriced = false;

  for (const leg of legs) {
    if (leg.amountRaw < 0n) {
      return fail('bad-reserve');
    }
    const claimRaw = (leg.amountRaw * lpBalance) / totalShare;
    const whole = rawToWholeNumber(claimRaw, leg.decimals);
    const crEligible = isCrEligibleLeg(leg.kind);
    if (crEligible) crEligibleCount += 1;
    if (leg.kind === 'wrap') haircutLegs.push(leg.symbol);

    if (!Number.isFinite(whole) || whole < 0 || !isValidPositivePrice(leg.usd)) {
      missingPriceLegs.push(leg.symbol);
      if (crEligible) crUnpriced = true;
      continue;
    }

    const legUsd = whole * leg.usd;
    displayUsd += legUsd;
    displayPriced += 1;
    if (crEligible) {
      crUsd += legUsd;
      crPricedCount += 1;
      includedLegs.push(leg.symbol);
    }
  }

  if (crUnpriced) {
    return {
      ok: false,
      displayUsd: displayPriced > 0 ? displayUsd : null,
      crUsd: null,
      includedLegs,
      haircutLegs,
      missingPriceLegs,
      incomplete: true,
      reason: 'unpriced-cr-leg',
    };
  }

  const incomplete = missingPriceLegs.length > 0 || displayPriced === 0;
  return {
    ok: displayPriced > 0 || (crEligibleCount === 0 && !incomplete),
    displayUsd: displayPriced > 0 ? displayUsd : null,
    crUsd: crEligibleCount === 0 || crPricedCount === crEligibleCount ? crUsd : null,
    includedLegs,
    haircutLegs,
    missingPriceLegs,
    incomplete,
  };
}
