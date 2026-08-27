import { describe, expect, it } from 'vitest';
import { computeLpNav } from './lpNav';
import type { LpNavLegInput } from './lpNav';

const SHARE = 1_000_000n;
const TEN_PCT = 100_000n;

function ust1Leg(whole: number, usd: number | null = 1): LpNavLegInput {
  return {
    symbol: 'UST1',
    amountRaw: BigInt(whole) * 1_000_000n,
    decimals: 6,
    kind: 'ust1',
    usd,
  };
}

function ustrLeg(whole: number, usd: number | null): LpNavLegInput {
  return {
    symbol: 'USTR',
    amountRaw: BigInt(whole) * 10n ** 18n,
    decimals: 18,
    kind: 'ustr',
    usd,
  };
}

describe('computeLpNav', () => {
  it('UST1/USTR 10% of 1000+2000 @ $1/$0.50 → display 200, crUsd 0', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [ust1Leg(1000), ustrLeg(2000, 0.5)],
    });
    expect(result.ok).toBe(true);
    expect(result.displayUsd).toBeCloseTo(200);
    expect(result.crUsd).toBe(0);
    expect(result.haircutLegs).toEqual(['UST1', 'USTR']);
    expect(result.includedLegs).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it('UST1/cUSTC: display 101, crUsd 0 (both protocol)', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [
        ust1Leg(1000),
        {
          symbol: 'cUSTC',
          amountRaw: 1000n * 1_000_000n,
          decimals: 6,
          kind: 'wrap',
          usd: 0.01,
        },
      ],
    });
    expect(result.displayUsd).toBeCloseTo(101);
    expect(result.crUsd).toBe(0);
    expect(result.haircutLegs).toEqual(['UST1', 'cUSTC']);
    expect(result.includedLegs).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it('cLUNC/LUNC: display both sides, CR only LUNC', () => {
    const millionWhole = 1_000_000n * 1_000_000n; // 1e6 tokens at 6dp
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [
        { symbol: 'cLUNC', amountRaw: millionWhole, decimals: 6, kind: 'wrap', usd: 0.0001 },
        { symbol: 'LUNC', amountRaw: millionWhole, decimals: 6, kind: 'other', usd: 0.0001 },
      ],
    });
    // 10% of 1e6 = 1e5 whole × $0.0001 = $10 per side
    expect(result.displayUsd).toBeCloseTo(20);
    expect(result.crUsd).toBeCloseTo(10);
    expect(result.haircutLegs).toEqual(['cLUNC']);
    expect(result.includedLegs).toEqual(['LUNC']);
  });

  it('USTR/LUNC: CR is LUNC only (USTR out — #16)', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [
        ustrLeg(2000, 0.5),
        {
          symbol: 'LUNC',
          amountRaw: 1_000_000n * 1_000_000n,
          decimals: 6,
          kind: 'other',
          usd: 0.0001,
        },
      ],
    });
    expect(result.crUsd).toBeCloseTo(10);
    expect(result.includedLegs).toEqual(['LUNC']);
    expect(result.haircutLegs).toEqual(['USTR']);
  });

  it('CL8Y-cb/cUSTC: CR is CL8Y other only; unpriced CL8Y implies from wrap USTC', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [
        {
          symbol: 'CL8Y-cb',
          amountRaw: 2000n * 10n ** 18n,
          decimals: 18,
          kind: 'other',
          usd: null,
        },
        {
          symbol: 'cUSTC',
          amountRaw: 1000n * 1_000_000n,
          decimals: 6,
          kind: 'wrap',
          usd: 0.01,
        },
      ],
    });
    // implied CL8Y = (1000 × $0.01) / 2000 = $0.005; 10% → display $2, CR $1
    expect(result.ok).toBe(true);
    expect(result.displayUsd).toBeCloseTo(2);
    expect(result.crUsd).toBeCloseTo(1);
    expect(result.includedLegs).toEqual(['CL8Y-cb']);
    expect(result.haircutLegs).toEqual(['cUSTC']);
    expect(result.incomplete).toBe(false);
  });

  it('CL8Y-cb/cUSTC: unpriced CL8Y and unpriced wrap fail-closes CR and lists CL8Y-cb', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [
        {
          symbol: 'CL8Y-cb',
          amountRaw: 2000n * 10n ** 18n,
          decimals: 18,
          kind: 'other',
          usd: null,
        },
        {
          symbol: 'cUSTC',
          amountRaw: 1000n * 1_000_000n,
          decimals: 6,
          kind: 'wrap',
          usd: null,
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.crUsd).toBeNull();
    expect(result.incomplete).toBe(true);
    expect(result.missingPriceLegs).toContain('CL8Y-cb');
    expect(result.haircutLegs).toEqual(['cUSTC']);
  });

  it('UST1/vFDUSD: CR is vFDUSD side only', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [
        ust1Leg(1000),
        {
          symbol: 'vFDUSD',
          amountRaw: 1000n * 1_000_000n,
          decimals: 6,
          kind: 'other',
          usd: 1.22,
        },
      ],
    });
    expect(result.crUsd).toBeCloseTo(122);
    expect(result.displayUsd).toBeCloseTo(222);
    expect(result.includedLegs).toEqual(['vFDUSD']);
    expect(result.haircutLegs).toEqual(['UST1']);
  });

  it('UST1/ALPHA: CR is ALPHA side only', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [
        ust1Leg(1000),
        {
          symbol: 'ALPHA',
          amountRaw: 5000n * 1_000_000n,
          decimals: 6,
          kind: 'other',
          usd: 0.02,
        },
      ],
    });
    expect(result.crUsd).toBeCloseTo(10);
    expect(result.displayUsd).toBeCloseTo(110);
    expect(result.includedLegs).toEqual(['ALPHA']);
    expect(result.haircutLegs).toEqual(['UST1']);
  });

  it('total_share == 0 → fail closed, no NaN USD', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: 0n,
      legs: [ust1Leg(1000), ustrLeg(2000, 0.5)],
    });
    expect(result.ok).toBe(false);
    expect(result.crUsd).toBeNull();
    expect(result.displayUsd).toBeNull();
    expect(result.reason).toBe('zero-share');
  });

  it('lp balance 0 → zero NAV, not in CR', () => {
    const result = computeLpNav({
      lpBalance: 0n,
      totalShare: SHARE,
      legs: [ust1Leg(1000), ustrLeg(2000, 0.5)],
    });
    expect(result.displayUsd).toBe(0);
    expect(result.crUsd).toBe(0);
    expect(result.reason).toBe('zero-balance');
  });

  it('lp_balance > total_share → fail closed', () => {
    const result = computeLpNav({
      lpBalance: SHARE + 1n,
      totalShare: SHARE,
      legs: [ust1Leg(1000), ustrLeg(2000, 0.5)],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('over-share');
    expect(result.crUsd).toBeNull();
  });

  it('unpriced USTR implies from priced UST1 peer for display only (CR stays 0)', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [ust1Leg(1000), ustrLeg(2000, null)],
    });
    // 1000 UST1 × $1 / 2000 USTR → $0.50; 10% claim → display $200, CR $0
    expect(result.ok).toBe(true);
    expect(result.displayUsd).toBeCloseTo(200);
    expect(result.crUsd).toBe(0);
    expect(result.incomplete).toBe(false);
    expect(result.includedLegs).toEqual([]);
  });

  it('unpriced USTR with unpriced UST1: display incomplete, CR still 0', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [ust1Leg(1000, null), ustrLeg(2000, null)],
    });
    expect(result.crUsd).toBe(0);
    expect(result.incomplete).toBe(true);
    expect(result.displayUsd).toBeNull();
  });

  it('unpriced wrap leg: CR is 0 (UST1 also haircut), display incomplete', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [
        ust1Leg(1000),
        { symbol: 'cUSTC', amountRaw: 1000n * 1_000_000n, decimals: 6, kind: 'wrap', usd: null },
      ],
    });
    expect(result.crUsd).toBe(0);
    expect(result.incomplete).toBe(true);
    expect(result.missingPriceLegs).toContain('cUSTC');
  });

  it('unknown leg on a pinned LP fail-closes CR', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [
        ust1Leg(1000),
        { symbol: 'cUSTC', amountRaw: 1000n * 1_000_000n, decimals: 6, kind: 'unknown', usd: null },
      ],
    });
    expect(result.crUsd).toBeNull();
    expect(result.reason).toBe('unknown-leg');
    expect(result.incomplete).toBe(true);
  });

  it('USTR 18dp vs UST1 6dp uses rawToWholeNumber (not Number(bigint))', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [ust1Leg(1000), ustrLeg(2000, 0.5)],
    });
    expect(result.displayUsd).toBeCloseTo(200);
  });

  it('huge reserve whole > MAX_SAFE_INTEGER on an other leg → crUsd null', () => {
    const huge = (BigInt(Number.MAX_SAFE_INTEGER) + 10n) * 1_000_000n;
    const result = computeLpNav({
      lpBalance: SHARE,
      totalShare: SHARE,
      legs: [
        { symbol: 'LUNC', amountRaw: huge, decimals: 6, kind: 'other', usd: 0.0001 },
        ustrLeg(1, 0.5),
      ],
    });
    expect(result.crUsd).toBeNull();
    expect(result.incomplete).toBe(true);
    expect(result.missingPriceLegs).toContain('LUNC');
  });

  it('not exactly two legs → fail closed', () => {
    const result = computeLpNav({
      lpBalance: TEN_PCT,
      totalShare: SHARE,
      legs: [ust1Leg(1000)],
    });
    expect(result.reason).toBe('bad-legs');
    expect(result.crUsd).toBeNull();
  });
});
