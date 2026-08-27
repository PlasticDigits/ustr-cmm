import { describe, expect, it } from 'vitest';
import {
  TREASURY_ASSETS_GRID_CLASS,
  formatTreasuryCardAmount,
  formatTreasuryCrHaircut,
  formatTreasuryUsd,
} from './treasuryAssetDisplay';

describe('TREASURY_ASSETS_GRID_CLASS', () => {
  it('keeps 2-col through lg (1024) and reserves 3-col for xl', () => {
    expect(TREASURY_ASSETS_GRID_CLASS).toMatch(/grid-cols-1/);
    expect(TREASURY_ASSETS_GRID_CLASS).toMatch(/sm:grid-cols-2/);
    expect(TREASURY_ASSETS_GRID_CLASS).toMatch(/xl:grid-cols-3/);
    expect(TREASURY_ASSETS_GRID_CLASS).not.toMatch(/lg:grid-cols-3/);
  });
});

describe('formatTreasuryUsd', () => {
  it('uses two decimals at or above a cent, including exact zero', () => {
    expect(formatTreasuryUsd(0)).toBe('$0.00');
    expect(formatTreasuryUsd(12.3)).toBe('$12.30');
    expect(formatTreasuryUsd(0.01)).toBe('$0.01');
  });

  it('keeps six decimals for dust under a cent', () => {
    expect(formatTreasuryUsd(0.000001)).toBe('$0.000001');
  });
});

describe('formatTreasuryCrHaircut', () => {
  it('keeps every omitted leg and an explicit $0 CR', () => {
    expect(formatTreasuryCrHaircut(0, ['cUSTC'])).toBe('CR $0.00 · cUSTC omitted');
    expect(formatTreasuryCrHaircut(12.5, ['cUSTC', 'UST1'])).toBe(
      'CR $12.50 · cUSTC, UST1 omitted',
    );
  });

  it('still discloses legs when crUsd is unknown', () => {
    expect(formatTreasuryCrHaircut(null, ['UST1', 'USTR'])).toBe(
      'UST1, USTR omitted from CR',
    );
  });

  it('renders nothing when there is no haircut', () => {
    expect(formatTreasuryCrHaircut(10, [])).toBeNull();
  });

  it('tolerates a future long omitted-leg list (e.g. CL8Y/cUSTC)', () => {
    const line = formatTreasuryCrHaircut(0, ['cUSTC', 'UST1']);
    expect(line).toContain('cUSTC');
    expect(line).toContain('UST1');
    expect(line).toContain('omitted');
  });
});

describe('formatTreasuryCardAmount', () => {
  it('keeps full display decimals for small balances', () => {
    expect(formatTreasuryCardAmount(1_234_567n, 6)).toBe('1.234567');
  });

  it('uses two display decimals for large USTC/LUNC-scale balances', () => {
    expect(formatTreasuryCardAmount(41_190_153_481_234n, 6)).toBe('41,190,153.48');
  });
});
