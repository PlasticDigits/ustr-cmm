import { describe, expect, it } from 'vitest';
import { computeTreasuryRatios } from './treasuryRatios';

const UST1_1M = 1_000_000_000_000n; // 1,000,000 UST1 at 6dp

describe('computeTreasuryRatios', () => {
  it('fixture: 1e6 UST1 and $2e6 priced assets → CR 200% and A/L 2.00x', () => {
    const result = computeTreasuryRatios({
      ust1SupplyRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 1_000_000_000_000n, decimals: 6 }],
      prices: { vFDUSD: 2 },
      ustrBacking: 0.5,
    });
    expect(result.ust1SupplyStatus).toBe('positive');
    expect(result.collateralization).toBeCloseTo(200);
    expect(result.assetsToLiabilities).toBeCloseTo(2);
    expect(result.ustrBacking).toBe(0.5);
    expect(result.includedSymbols).toEqual(['vFDUSD']);
    expect(result.incomplete).toBe(false);
  });

  it('USTC-per-UST1 = whole USTC / whole UST1', () => {
    const result = computeTreasuryRatios({
      ust1SupplyRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 2_000_000_000_000n,
      ustcDecimals: 6,
      assets: [{ symbol: 'USTC', balanceRaw: 2_000_000_000_000n, decimals: 6 }],
      prices: { USTC: 0.01 },
      ustrBacking: 0,
    });
    expect(result.ustcPerUst1).toBeCloseTo(2);
  });

  it('successful zero supply → ∞, not 0', () => {
    const result = computeTreasuryRatios({
      ust1SupplyRaw: 0n,
      ust1Decimals: 6,
      ustcBalanceRaw: 1n,
      ustcDecimals: 6,
      assets: [],
      prices: {},
      ustrBacking: 0,
    });
    expect(result.ust1SupplyStatus).toBe('zero');
    expect(result.collateralization).toBe(Number.POSITIVE_INFINITY);
    expect(result.ustcPerUst1).toBe(Number.POSITIVE_INFINITY);
    expect(result.assetsToLiabilities).toBe(Number.POSITIVE_INFINITY);
  });

  it('failed supply query → NaN (N/A), never ∞ or stub 0', () => {
    const result = computeTreasuryRatios({
      ust1SupplyRaw: null,
      ust1Decimals: 6,
      ustcBalanceRaw: 1n,
      ustcDecimals: 6,
      assets: [{ symbol: 'LUNC', balanceRaw: 1n, decimals: 6 }],
      prices: { LUNC: 0.0001 },
      ustrBacking: 0,
    });
    expect(result.ust1SupplyStatus).toBe('unknown');
    expect(Number.isNaN(result.collateralization)).toBe(true);
    expect(result.collateralization).not.toBe(0);
    expect(Number.isFinite(result.collateralization)).toBe(false);
  });

  it('unpriced balances are omitted and mark incomplete — not $0', () => {
    const result = computeTreasuryRatios({
      ust1SupplyRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 1_000_000_000_000n,
      ustcDecimals: 6,
      assets: [
        { symbol: 'USTC', balanceRaw: 1_000_000_000_000n, decimals: 6 },
        { symbol: 'ALPHA', balanceRaw: 5_000_000n, decimals: 6 },
      ],
      prices: { USTC: 0.01 },
      ustrBacking: 0,
    });
    expect(result.incomplete).toBe(true);
    expect(result.includedSymbols).toEqual(['USTC']);
    expect(result.missingPriceSymbols).toEqual(['ALPHA']);
    expect(result.collateralization).toBeCloseTo(1); // $10k / 1e6 * 100
  });

  it('all prices missing with supply > 0 → N/A CR, not 0%', () => {
    const result = computeTreasuryRatios({
      ust1SupplyRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 1n,
      ustcDecimals: 6,
      assets: [{ symbol: 'LUNC', balanceRaw: 1_000_000n, decimals: 6 }],
      prices: {},
      ustrBacking: 0,
    });
    expect(Number.isNaN(result.collateralization)).toBe(true);
    expect(result.incomplete).toBe(true);
  });

  it('does not invent $1/vFDUSD when vFDUSD is unpriced', () => {
    const result = computeTreasuryRatios({
      ust1SupplyRaw: UST1_1M,
      ust1Decimals: 6,
      ustcBalanceRaw: 0n,
      ustcDecimals: 6,
      assets: [{ symbol: 'vFDUSD', balanceRaw: 8_186_501n, decimals: 6 }],
      prices: {},
      ustrBacking: 0,
    });
    expect(result.missingPriceSymbols).toContain('vFDUSD');
    expect(Number.isNaN(result.collateralization)).toBe(true);
  });
});
