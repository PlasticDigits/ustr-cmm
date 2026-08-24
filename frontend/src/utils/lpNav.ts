/**
 * Reserve NAV for treasury LP shares (#14, CR haircut revised by #16).
 *
 * share claim_i = floor(reserve_i * lp_balance / total_share)
 * displayUsd    = Σ claim_i * usd_i   (all priced legs, including protocol)
 * crUsd         = Σ claim_i * usd_i   for `other` legs only (LUNC, USTC, ALPHA, vFDUSD, …)
 *
 * Fail closed: total_share == 0, lp_balance > total_share, unknown leg, non-finite wholes.
 * Unpriced CR-eligible (`other`) leg → crUsd = null. Never treat missing USD as $0 or $1.
 */

import { isValidPositivePrice, rawToWholeNumber } from './decimals';
import { isCrEligibleLeg, isProtocolHaircutLeg, type LpLegKind } from './lpEligibility';

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
  | 'unpriced-cr-leg'
  | 'unknown-leg';

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

/**
 * If a ustr/other leg has no USD but the peer reserve is priced, use the AMM
 * reserve ratio (peer_whole × peer_usd / this_whole). Does not invent $1 for
 * USTR, does not price wraps or unknown legs, does not simulate-swap the LP mint.
 */
export function applyImpliedLpLegUsd(legs: LpNavLegInput[]): LpNavLegInput[] {
  if (legs.length !== 2) return legs;
  const wholes = legs.map((leg) => rawToWholeNumber(leg.amountRaw, leg.decimals));
  return legs.map((leg, i) => {
    if (isValidPositivePrice(leg.usd)) return leg;
    if (leg.kind !== 'ustr' && leg.kind !== 'other') return leg;
    const peer = legs[1 - i];
    const mine = wholes[i];
    const peerWhole = wholes[1 - i];
    if (!isValidPositivePrice(peer.usd)) return leg;
    if (!Number.isFinite(mine) || mine <= 0 || !Number.isFinite(peerWhole) || peerWhole <= 0) {
      return leg;
    }
    const implied = (peerWhole * peer.usd) / mine;
    if (!isValidPositivePrice(implied)) return leg;
    return { ...leg, usd: implied };
  });
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

  const pricedLegs = applyImpliedLpLegUsd(legs);

  let displayUsd = 0;
  let crUsd = 0;
  let displayPriced = 0;
  const includedLegs: string[] = [];
  const haircutLegs: string[] = [];
  const missingPriceLegs: string[] = [];
  let crEligibleCount = 0;
  let crPricedCount = 0;
  let crUnpriced = false;

  for (const leg of pricedLegs) {
    if (leg.amountRaw < 0n) {
      return fail('bad-reserve');
    }
    const claimRaw = (leg.amountRaw * lpBalance) / totalShare;
    const whole = rawToWholeNumber(claimRaw, leg.decimals);
    if (leg.kind === 'unknown') {
      return fail('unknown-leg', {
        haircutLegs,
        missingPriceLegs: [...missingPriceLegs, leg.symbol],
      });
    }
    const crEligible = isCrEligibleLeg(leg.kind);
    if (crEligible) crEligibleCount += 1;
    if (isProtocolHaircutLeg(leg.kind)) haircutLegs.push(leg.symbol);

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
