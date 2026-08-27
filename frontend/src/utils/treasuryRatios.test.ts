import { describe, expect, it } from 'vitest';
import { computeTreasuryRatios } from './treasuryRatios';

const UST1_1M = 1_000_000_000_000n; // 1,000,000 UST1 at 6dp
const UST1_500K = 500_000_000_000n;

describe('computeTreasuryRatios', () => {
  it('fixture: 1e6 available UST1 and $2e6 priced assets → CR 200% / 2.00x / BLUE', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 }],
      prices: { vFDUSD: 2 },
    });
    expect(result.ust1SupplyStatus).toBe('positive');
    expect(result.collateralization).toBeCloseTo(200);
    expect(result.assetsToLiabilities).toBeCloseTo(2);
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
    });
    expect(result.collateralization).toBeCloseTo(400);
    expect(result.assetsToLiabilities).toBeCloseTo(4);
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
    });
    expect(result.ustcPerUst1).toBeCloseTo(4);
  });

  it('certified zero available → ∞ and BLUE only when prices are complete', () => {
    const ready = computeTreasuryRatios({
      ust1AvailableRaw: 0n,
      ust1Decimals: 6,
      ustcBalanceRaw: 1n,
      ustcDecimals: 6,
      assets: [],
      prices: {},
    });
    expect(ready.ust1SupplyStatus).toBe('zero');
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
    });
    expect(result.ust1SupplyStatus).toBe('unknown');
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
    });
    expect(result.incomplete).toBe(true);
    expect(result.pricesReady).toBe(false);
    expect(result.missingPriceSymbols).toEqual(['ALPHA']);
    expect(Number.isNaN(result.collateralization)).toBe(true);
    expect(result.tier).toBeNull();
  });

  it('UST1/USTR LP crUsd 0 does not change CR', () => {
    const result = computeTreasuryRatios({
      ust1AvailableRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'UST1-USTR', balanceRaw: 1n, decimals: 6, crUsd: 0 },
      ],
      prices: { vFDUSD: 2 },
    });
    expect(result.collateralization).toBeCloseTo(200);
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
        { symbol: 'UST1-vFDUSD', balanceRaw: 1n, decimals: 6, crUsd: 100_000 },
      ],
      prices: { vFDUSD: 2 },
    });
    expect(result.collateralization).toBeCloseTo(210);
    expect(result.assetsToLiabilities).toBeCloseTo(2.1);
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
        { symbol: 'CL8Y-cb-cUSTC', balanceRaw: 1n, decimals: 18, crUsd: 50_000 },
      ],
      prices: { vFDUSD: 2 },
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
        { symbol: 'UST1-USTR', balanceRaw: 5n, decimals: 6, crUsd: null },
      ],
      prices: { vFDUSD: 2 },
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
    });
    expect(result.collateralization).toBe(0);
    expect(result.incomplete).toBe(false);
    expect(result.pricesReady).toBe(true);
    expect(result.tier).toBe('RED');
  });
});
