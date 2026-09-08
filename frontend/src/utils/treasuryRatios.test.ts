import { describe, expect, it } from 'vitest';
import { computeTreasuryRatios, type ProtocolLiabilityInput } from './treasuryRatios';

const UST1_1M = 1_000_000_000_000n; // 1,000,000 UST1 at 6dp
const UST1_500K = 500_000_000_000n;

function ust1Debt(
  available: bigint,
  outstanding: bigint = available,
  known = true
): ProtocolLiabilityInput {
  return {
    label: 'UST1',
    outstandingRaw: known ? outstanding : null,
    availableRaw: known ? available : null,
    inventoryKnown: known,
    decimals: 6,
    usd: 1,
  };
}

function zeroEquity(): ProtocolLiabilityInput {
  return {
    label: 'USTR',
    outstandingRaw: 0n,
    availableRaw: 0n,
    inventoryKnown: true,
    decimals: 18,
    usd: null,
  };
}

function zeroWrap(label: 'cLUNC' | 'cUSTC'): ProtocolLiabilityInput {
  return {
    label,
    outstandingRaw: 0n,
    availableRaw: 0n,
    inventoryKnown: true,
    decimals: 6,
    usd: null,
  };
}

function ust1OnlyLiabilities(available: bigint, outstanding: bigint = available): ProtocolLiabilityInput[] {
  return [ust1Debt(available, outstanding), zeroEquity(), zeroWrap('cLUNC'), zeroWrap('cUSTC')];
}

describe('computeTreasuryRatios', () => {
  it('fixture: 1e6 available UST1 and $2e6 priced assets → CR 200% / 2.00x / BLUE', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 }],
      prices: { vFDUSD: 2 },
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.ust1SupplyStatus).toBe('positive');
    expect(result.liabilityStatus).toBe('positive');
    expect(result.collateralization).toBeCloseTo(200);
    expect(result.assetsToLiabilities).toBeCloseTo(2);
    expect(result.crAssetsUsd).toBeCloseTo(2_000_000);
    expect(result.totalAssetsUsd).toBeCloseTo(2_000_000);
    expect(result.crLiabilitiesUsd).toBeCloseTo(1_000_000);
    expect(result.totalLiabilitiesUsd).toBeCloseTo(1_000_000);
    expect(result.includedSymbols).toEqual(['vFDUSD']);
    expect(result.incomplete).toBe(false);
    expect(result.pricesReady).toBe(true);
    expect(result.tier).toBe('BLUE');
  });

  it('same assets with 500k CMM-owned (available 500k) → 400% — UST1 not in numerator', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_500K,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 }],
      prices: { vFDUSD: 2 },
      liabilities: ust1OnlyLiabilities(UST1_500K, UST1_1M),
    });
    expect(result.collateralization).toBeCloseTo(400);
    expect(result.assetsToLiabilities).toBeCloseTo(4);
    expect(result.totalLiabilitiesUsd).toBeCloseTo(1_000_000);
    expect(result.crLiabilitiesUsd).toBeCloseTo(500_000);
    expect(result.tier).toBe('BLUE');
  });

  it('USTC-per-UST1 uses available UST1', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_500K,
      ust1Decimals: 6,
      ustcBalanceRaw: 2_000_000_000_000n,
      ustcDecimals: 6,
      assets: [{ symbol: 'USTC', balanceRaw: 2_000_000_000_000n, decimals: 6 }],
      prices: { USTC: 0.01 },
      liabilities: ust1OnlyLiabilities(UST1_500K),
    });
    expect(result.ustcPerUst1).toBeCloseTo(4);
  });

  it('certified zero CR liabilities → ∞ and BLUE only when prices are complete', () => {
    const ready = computeTreasuryRatios({
      ust1AvailableRaw: 0n,
      ust1Decimals: 6,
      ustcBalanceRaw: 1n,
      ustcDecimals: 6,
      assets: [],
      prices: {},
      liabilities: ust1OnlyLiabilities(0n),
    });
    expect(ready.ust1SupplyStatus).toBe('zero');
    expect(ready.liabilityStatus).toBe('zero');
    expect(ready.collateralization).toBe(Number.POSITIVE_INFINITY);
    expect(ready.pricesReady).toBe(true);
    expect(ready.tier).toBe('BLUE');

    const gated = computeTreasuryRatios({
      ust1AvailableRaw: 0n,
      ust1Decimals: 6,
      ustcBalanceRaw: 1n,
      ustcDecimals: 6,
      assets: [{ symbol: 'ALPHA', balanceRaw: 5_000_000n, decimals: 6 }],
      prices: {},
      liabilities: ust1OnlyLiabilities(0n),
    });
    expect(gated.collateralization).toBe(Number.POSITIVE_INFINITY);
    expect(gated.incomplete).toBe(true);
    expect(gated.pricesReady).toBe(false);
    expect(gated.tier).toBeNull();
  });

  it('failed available-supply query → NaN (N/A), never ∞ or stub 0', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: null,
      ust1Decimals: 6,
      ustcBalanceRaw: 1n,
      ustcDecimals: 6,
      assets: [{ symbol: 'LUNC', balanceRaw: 1n, decimals: 6 }],
      prices: { LUNC: 0.0001 },
      liabilities: [ust1Debt(0n, 0n, false), zeroEquity(), zeroWrap('cLUNC'), zeroWrap('cUSTC')],
    });
    expect(result.ust1SupplyStatus).toBe('unknown');
    expect(result.liabilityStatus).toBe('unknown');
    expect(Number.isNaN(result.collateralization)).toBe(true);
    expect(result.pricesReady).toBe(false);
    expect(result.tier).toBeNull();
  });

  it('unpriced CR-relevant balances hide ratios — not a partial GREEN CR', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 1_000_000_000_000n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'USTC', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'ALPHA', balanceRaw: 5_000_000n, decimals: 6 },
      ],
      prices: { USTC: 0.01 },
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.incomplete).toBe(true);
    expect(result.pricesReady).toBe(false);
    expect(result.missingPriceSymbols).toEqual(['ALPHA']);
    expect(Number.isNaN(result.collateralization)).toBe(true);
    expect(result.tier).toBeNull();
  });

  it('UST1/USTR LP crUsd 0 does not change CR; displayUsd enters Total assets', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'UST1-USTR', balanceRaw: 1n, decimals: 6, crUsd: 0, displayUsd: 200 },
      ],
      prices: { vFDUSD: 2 },
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.collateralization).toBeCloseTo(200);
    expect(result.crAssetsUsd).toBeCloseTo(2_000_000);
    expect(result.totalAssetsUsd).toBeCloseTo(2_000_200);
    expect(result.includedSymbols).toEqual(['vFDUSD']);
    expect(result.incomplete).toBe(false);
    expect(result.tier).toBe('BLUE');
  });

  it('adds allowlisted LP other-leg crUsd only (210% fixture)', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'UST1-vFDUSD', balanceRaw: 1n, decimals: 6, crUsd: 100_000, displayUsd: 150_000 },
      ],
      prices: { vFDUSD: 2 },
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.collateralization).toBeCloseTo(210);
    expect(result.assetsToLiabilities).toBeCloseTo(2.1);
    expect(result.totalAssetsUsd).toBeCloseTo(2_150_000);
    expect(result.includedSymbols).toEqual(['vFDUSD', 'UST1-vFDUSD']);
    expect(result.incomplete).toBe(false);
  });

  it('CL8Y-cb LP other-leg crUsd enters the numerator', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'CL8Y-cb-cUSTC', balanceRaw: 1n, decimals: 18, crUsd: 50_000, displayUsd: 80_000 },
      ],
      prices: { vFDUSD: 2 },
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.collateralization).toBeCloseTo(205);
    expect(result.includedSymbols).toEqual(['vFDUSD', 'CL8Y-cb-cUSTC']);
    expect(result.incomplete).toBe(false);
    expect(result.tier).toBe('BLUE');
  });

  it('null LP crUsd is omitted and marks incomplete — not $0', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'UST1-USTR', balanceRaw: 5n, decimals: 6, crUsd: null, displayUsd: null },
      ],
      prices: { vFDUSD: 2 },
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(Number.isNaN(result.collateralization)).toBe(true);
    expect(result.missingPriceSymbols).toEqual(['UST1-USTR']);
    expect(result.incomplete).toBe(true);
    expect(result.pricesReady).toBe(false);
  });

  it('does not invent $1/vFDUSD when vFDUSD is unpriced', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 8_186_501n, decimals: 6 }],
      prices: {},
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.missingPriceSymbols).toContain('vFDUSD');
    expect(Number.isNaN(result.collateralization)).toBe(true);
    expect(result.pricesReady).toBe(false);
  });

  it('null LP crUsd fail-closes even when lp balance is 0 (balance query unknown)', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'UST1-USTR', balanceRaw: 0n, decimals: 18, crUsd: null },
      ],
      prices: { vFDUSD: 2 },
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.incomplete).toBe(true);
    expect(result.pricesReady).toBe(false);
    expect(Number.isNaN(result.collateralization)).toBe(true);
  });

  it('zero-numerator with no missing prices is a complete 0% RED CR', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [],
      prices: {},
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.collateralization).toBe(0);
    expect(result.incomplete).toBe(false);
    expect(result.pricesReady).toBe(true);
    expect(result.tier).toBe('RED');
  });

  it('protocol spot is Total-only; CR omits it', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'cUSTC', balanceRaw: 10_000_000_000n, decimals: 6, crUsd: 0, displayUsd: 100 },
        { symbol: 'cLUNC', balanceRaw: 1_000_000n, decimals: 6, crUsd: 0, displayUsd: 50 },
      ],
      prices: { vFDUSD: 2 },
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.crAssetsUsd).toBeCloseTo(2_000_000);
    expect(result.totalAssetsUsd).toBeCloseTo(2_000_150);
    expect(result.collateralization).toBeCloseTo(200);
    expect(result.includedSymbols).toEqual(['vFDUSD']);
  });

  it('wrap debt enters Total and CR liabilities; CMM-owned is the haircut; USTR equity is omitted', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 }],
      prices: { vFDUSD: 2 },
      liabilities: [
        ust1Debt(UST1_1M, UST1_1M + 100_000_000_000n),
        {
          label: 'USTR',
          outstandingRaw: 4n * 10n ** 18n,
          availableRaw: 2n * 10n ** 18n,
          inventoryKnown: true,
          decimals: 18,
          usd: 0.5,
        },
        {
          label: 'cLUNC',
          outstandingRaw: 1_000_000_000_000n,
          availableRaw: 800_000_000_000n,
          inventoryKnown: true,
          decimals: 6,
          usd: 0.0001,
        },
        {
          label: 'cUSTC',
          outstandingRaw: 10_000_000_000n,
          availableRaw: 4_000_000_000n,
          inventoryKnown: true,
          decimals: 6,
          usd: 0.01,
        },
      ],
    });
    // Total liab: UST1 1.1e6 + cLUNC 100 + cUSTC 100 = 1,100,200 (USTR omitted)
    expect(result.totalLiabilitiesUsd).toBeCloseTo(1_100_200);
    // CR liab: UST1 1e6 + cLUNC 80 + cUSTC 40 = 1,000,120
    expect(result.crLiabilitiesUsd).toBeCloseTo(1_000_120);
    expect(result.collateralization).toBeCloseTo((2_000_000 / 1_000_120) * 100);
    expect(result.pricesReady).toBe(true);
  });

  it('unpriced USTR does not fail-close CR — equity is not a liability', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 }],
      prices: { vFDUSD: 2 },
      liabilities: [
        ust1Debt(UST1_1M),
        {
          label: 'USTR',
          outstandingRaw: 1n * 10n ** 18n,
          availableRaw: 1n * 10n ** 18n,
          inventoryKnown: true,
          decimals: 18,
          usd: null,
        },
        zeroWrap('cLUNC'),
        zeroWrap('cUSTC'),
      ],
    });
    expect(result.liabilityStatus).toBe('positive');
    expect(result.missingPriceSymbols).not.toContain('USTR');
    expect(result.pricesReady).toBe(true);
    expect(result.collateralization).toBeCloseTo(200);
    expect(result.totalLiabilitiesUsd).toBeCloseTo(1_000_000);
    expect(result.crLiabilitiesUsd).toBeCloseTo(1_000_000);
  });

  it('not-launched wraps are skipped; uncertified wrap inventory fail-closes', () => {
    const skipped = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 }],
      prices: { vFDUSD: 2 },
      liabilities: [
        ust1Debt(UST1_1M),
        zeroEquity(),
        { label: 'cLUNC', outstandingRaw: null, availableRaw: null, inventoryKnown: false, decimals: 6, usd: null },
        { label: 'cUSTC', outstandingRaw: null, availableRaw: null, inventoryKnown: false, decimals: 6, usd: null },
      ],
    });
    expect(skipped.pricesReady).toBe(true);
    expect(skipped.collateralization).toBeCloseTo(200);

    const uncertified = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 }],
      prices: { vFDUSD: 2 },
      liabilities: [
        ust1Debt(UST1_1M),
        zeroEquity(),
        { label: 'cLUNC', outstandingRaw: 1n, availableRaw: null, inventoryKnown: false, decimals: 6, usd: 0.0001 },
        zeroWrap('cUSTC'),
      ],
    });
    expect(uncertified.liabilityStatus).toBe('unknown');
    expect(uncertified.pricesReady).toBe(false);
  });

  it('unpriced protocol spot marks Total incomplete without hiding a complete CR', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'USTR', balanceRaw: 1n, decimals: 18, crUsd: 0, displayUsd: null },
      ],
      prices: { vFDUSD: 2 },
      liabilities: ust1OnlyLiabilities(UST1_1M),
    });
    expect(result.incomplete).toBe(false);
    expect(result.totalIncomplete).toBe(true);
    expect(result.pricesReady).toBe(true);
    expect(result.collateralization).toBeCloseTo(200);
    expect(Number.isNaN(result.totalAssetsUsd)).toBe(true);
    expect(result.crAssetsUsd).toBeCloseTo(2_000_000);
  });
});
