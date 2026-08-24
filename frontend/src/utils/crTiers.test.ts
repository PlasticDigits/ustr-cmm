import { describe, expect, it } from 'vitest';
import { CR_TIER_COPY, PRICES_NOT_LOADED_MESSAGE, crColorTier, crTierCopy } from './crTiers';

describe('crColorTier', () => {
  it('uses inclusive 95 / 110 / 190 bands; ∞ is BLUE', () => {
    expect(crColorTier(94.99)).toBe('RED');
    expect(crColorTier(95)).toBe('YELLOW');
    expect(crColorTier(109.99)).toBe('YELLOW');
    expect(crColorTier(110)).toBe('GREEN');
    expect(crColorTier(190)).toBe('GREEN');
    expect(crColorTier(190.01)).toBe('BLUE');
    expect(crColorTier(Number.POSITIVE_INFINITY)).toBe('BLUE');
    expect(crColorTier(Number.NaN)).toBeNull();
  });
});

describe('crTierCopy', () => {
  it('RED / YELLOW / GREEN / BLUE operational lines match the treasury table', () => {
    expect(crTierCopy(94)?.swap).toBe('Cannot swap UST1 for collateral');
    expect(crTierCopy(94)?.rewards).toBe('No new staking rewards');
    expect(crTierCopy(94)?.system).toBe('Recovery');

    expect(crTierCopy(95)?.swap).toBe('Can swap UST1 for collateral');
    expect(crTierCopy(95)?.rewards).toBe('No staking rewards');
    expect(crTierCopy(95)?.system).toBe('Stable');

    expect(crTierCopy(110)?.swap).toBe('Can swap UST1 for collateral');
    expect(crTierCopy(110)?.rewards).toBe('Partial staking rewards issuance');
    expect(crTierCopy(110)?.system).toBe('Healthy');

    expect(crTierCopy(200)?.swap).toBe('Can swap UST1 for collateral');
    expect(crTierCopy(200)?.rewards).toBe('Full staking rewards issuance');
    expect(crTierCopy(200)?.system).toBe('Optimal');

    expect(CR_TIER_COPY.BLUE.system).toBe('Optimal');
    expect(PRICES_NOT_LOADED_MESSAGE).toBe('prices not loaded, cannot display key ratios');
  });
});
