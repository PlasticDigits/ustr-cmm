/**
 * Named CR color tiers (#16 / ECONOMICS 95 / 110 / 190).
 *
 * Treasury-page copy describes intended swap + staking-reward state.
 * It does not claim on-chain mint/swap/staking already enforce these gates.
 */

import { CR_TIERS } from './constants';

export type CrColorTier = 'RED' | 'YELLOW' | 'GREEN' | 'BLUE';

export interface CrTierCopy {
  name: CrColorTier;
  swap: string;
  rewards: string;
  system: string;
}

export const CR_TIER_COPY: Record<CrColorTier, CrTierCopy> = {
  RED: {
    name: 'RED',
    swap: 'Cannot swap UST1 for collateral',
    rewards: 'No new staking rewards',
    system: 'Recovery',
  },
  YELLOW: {
    name: 'YELLOW',
    swap: 'Can swap UST1 for collateral',
    rewards: 'No staking rewards',
    system: 'Stable',
  },
  GREEN: {
    name: 'GREEN',
    swap: 'Can swap UST1 for collateral',
    rewards: 'Partial staking rewards issuance',
    system: 'Healthy',
  },
  BLUE: {
    name: 'BLUE',
    swap: 'Can swap UST1 for collateral',
    rewards: 'Full staking rewards issuance',
    system: 'Optimal',
  },
};

export const PRICES_NOT_LOADED_MESSAGE = 'prices not loaded, cannot display key ratios';

/**
 * Key Ratios body is this exact string unless every CR-relevant price is loaded
 * **and** UST1 available supply is certified. Inventory failure uses the same
 * copy (#16 skill / #18 optional nit) — do not invent a second banner.
 */
export function shouldShowKeyRatios(args: {
  isLoading?: boolean;
  pricesReady: boolean;
  ust1SupplyStatus: 'zero' | 'positive' | 'unknown';
  liabilityStatus?: 'zero' | 'positive' | 'unknown';
  tier: CrColorTier | null;
}): boolean {
  const liabilityStatus = args.liabilityStatus ?? args.ust1SupplyStatus;
  return (
    !args.isLoading &&
    args.pricesReady &&
    args.ust1SupplyStatus !== 'unknown' &&
    liabilityStatus !== 'unknown' &&
    args.tier !== null
  );
}

/**
 * Inclusive bands as implemented today:
 *   RED    < 95
 *   YELLOW [95, 110)
 *   GREEN  [110, 190]
 *   BLUE   > 190  (including ∞)
 */
export function crColorTier(ratio: number): CrColorTier | null {
  if (Number.isNaN(ratio)) return null;
  if (!Number.isFinite(ratio)) return 'BLUE';
  if (ratio < CR_TIERS.redBelow) return 'RED';
  if (ratio < CR_TIERS.yellowBelow) return 'YELLOW';
  if (ratio <= CR_TIERS.greenAtMost) return 'GREEN';
  return 'BLUE';
}

export function crTierCopy(ratio: number): CrTierCopy | null {
  const tier = crColorTier(ratio);
  return tier ? CR_TIER_COPY[tier] : null;
}

export function crTierTextClass(tier: CrColorTier | null): string {
  switch (tier) {
    case 'RED':
      return 'text-red-400';
    case 'YELLOW':
      return 'text-amber-400';
    case 'GREEN':
      return 'text-emerald-400';
    case 'BLUE':
      return 'text-sky-400';
    default:
      return 'text-gray-400';
  }
}
