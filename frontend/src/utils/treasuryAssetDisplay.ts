/**
 * Display-only helpers for Treasury Assets tiles (#21).
 *
 * Invariants:
 * - Do not change CR / NAV / available-supply math, haircut eligibility,
 *   dust filters, tokenlist allowlists, or on-chain queries.
 * - Haircut copy always lists every omitted protocol/wrap symbol. Do not hide
 *   $0 CR or drop a leg to save space.
 * - Grid is 1-col <640, 2-col through tablet including 1024 (`lg`), 3-col only
 *   at `xl` (1280+). Do not use `lg:grid-cols-3`.
 * - Primary amount, USD, and CR lines must wrap — never CSS ellipsis. iPad has
 *   no hover, so `title` is supplementary only.
 * - `formatPoolShare` rounding stays in `format.ts` (`≥ 0.99995` → 100%).
 *
 * Playbook: skills/frontend-treasury-assets-layout/SKILL.md
 */

import { formatAmount } from './format';

/** Shared loaded-grid + skeleton breakpoints. */
export const TREASURY_ASSETS_GRID_CLASS =
  'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3';

/**
 * Card-only USD. Dust `< $0.01` keeps six fraction digits; otherwise two.
 * Not a CR input.
 */
export function formatTreasuryUsd(value: number): string {
  if (value > 0 && value < 0.01) {
    return `$${value.toFixed(6)}`;
  }
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Visible CR haircut line. Meaning is unchanged from the long form
 * `CR counts $x (leg, … omitted)` — shorter so tablet tiles do not clip.
 * Returns null when there is nothing to disclose.
 */
export function formatTreasuryCrHaircut(
  crUsd: number | null | undefined,
  haircutLegs: readonly string[],
): string | null {
  if (haircutLegs.length === 0) return null;
  const omitted = haircutLegs.join(', ');
  if (crUsd !== null && crUsd !== undefined) {
    return `CR ${formatTreasuryUsd(crUsd)} · ${omitted} omitted`;
  }
  return `${omitted} omitted from CR`;
}

/**
 * Card-only spot amount. Whole values ≥ 1000 use two fraction digits so
 * USTC/LUNC-scale balances fit a tile; raw `balance` is untouched.
 */
export function formatTreasuryCardAmount(
  balance: bigint,
  decimals: number,
): string {
  const whole = Number(balance) / 10 ** decimals;
  if (Number.isFinite(whole) && Math.abs(whole) >= 1000) {
    return formatAmount(balance, decimals, 2);
  }
  return formatAmount(balance, decimals);
}
