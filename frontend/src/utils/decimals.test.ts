import { describe, expect, it } from 'vitest';
import { isValidPositivePrice, rawToWholeNumber } from './decimals';

describe('rawToWholeNumber', () => {
  it('converts 6dp UST1 raw 1e12 to 1_000_000 whole tokens', () => {
    expect(rawToWholeNumber(1_000_000_000_000n, 6)).toBe(1_000_000);
  });

  it('converts 18dp USTR without Number(bigint) on the raw value', () => {
    // 1.5 USTR
    expect(rawToWholeNumber(1_500_000_000_000_000_000n, 18)).toBe(1.5);
  });

  it('returns 0 for zero raw', () => {
    expect(rawToWholeNumber(0n, 6)).toBe(0);
  });

  it('returns NaN for whole parts above MAX_SAFE_INTEGER', () => {
    const tooBig = (BigInt(Number.MAX_SAFE_INTEGER) + 1n) * 1_000_000n;
    expect(Number.isNaN(rawToWholeNumber(tooBig, 6))).toBe(true);
  });

  it('returns NaN for invalid decimals', () => {
    expect(Number.isNaN(rawToWholeNumber(1n, -1))).toBe(true);
    expect(Number.isNaN(rawToWholeNumber(1n, 19))).toBe(true);
  });
});

describe('isValidPositivePrice', () => {
  it('rejects 0, NaN, Infinity, and non-numbers', () => {
    expect(isValidPositivePrice(0)).toBe(false);
    expect(isValidPositivePrice(Number.NaN)).toBe(false);
    expect(isValidPositivePrice(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidPositivePrice(undefined)).toBe(false);
    expect(isValidPositivePrice(1.22)).toBe(true);
  });
});
