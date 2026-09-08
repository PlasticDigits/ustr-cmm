import { describe, expect, it } from 'vitest';
import { applyImpliedLpLegUsd, type LpNavLegInput } from './lpNav';
import {
  protocolHoldingUsd,
  protocolTokenUnitUsd,
  resolveUstrUsd,
} from './protocolHoldings';

const ust1Leg = (whole: number): LpNavLegInput => ({
  symbol: 'UST1',
  amountRaw: BigInt(whole) * 1_000_000n,
  decimals: 6,
  kind: 'ust1',
  usd: 1,
});

const ustrLeg = (whole: number, usd: number | null): LpNavLegInput => ({
  symbol: 'USTR',
  amountRaw: BigInt(whole) * 10n ** 18n,
  decimals: 18,
  kind: 'ustr',
  usd,
});

describe('resolveUstrUsd', () => {
  it('prefers a mapped USTR print over LP implied', () => {
    expect(resolveUstrUsd({ USTR: 0.4 }, [[ust1Leg(1000), ustrLeg(2000, null)]])).toBe(0.4);
  });

  it('implies USTR from UST1/USTR reserves when the map is empty', () => {
    // 1000 UST1 @ $1 / 2000 USTR → $0.50
    expect(resolveUstrUsd({}, [[ust1Leg(1000), ustrLeg(2000, null)]])).toBeCloseTo(0.5);
  });

  it('does not invent $1 when no USTR print and no USTR LP legs', () => {
    expect(resolveUstrUsd({}, [])).toBeNull();
    expect(resolveUstrUsd({ USTR: 0 }, [[ust1Leg(1000), ustrLeg(2000, null)]])).toBeCloseTo(0.5);
  });
});

describe('protocolTokenUnitUsd', () => {
  it('UST1 is $1; wraps follow natives; USTR uses implied/map', () => {
    expect(protocolTokenUnitUsd('ust1', {}, null)).toBe(1);
    expect(protocolTokenUnitUsd('cLunc', { LUNC: 0.0001 }, null)).toBe(0.0001);
    expect(protocolTokenUnitUsd('cUstc', { USTC: 0.01 }, null)).toBe(0.01);
    expect(protocolTokenUnitUsd('cUstc', {}, null)).toBeNull();
    expect(protocolTokenUnitUsd('ustr', {}, 0.25)).toBe(0.25);
    expect(protocolTokenUnitUsd('ustr', {}, null)).toBeNull();
  });
});

describe('protocolHoldingUsd', () => {
  it('values spot wraps at native USD and omits unpriced', () => {
    expect(protocolHoldingUsd('cUstc', 2_000_000n, { USTC: 0.01 }, null)).toBeCloseTo(0.02);
    expect(protocolHoldingUsd('cLunc', 1_000_000n, {}, null)).toBeNull();
    expect(protocolHoldingUsd('ust1', 5_000_000n, {}, null)).toBeCloseTo(5);
    expect(protocolHoldingUsd('ustr', 2n * 10n ** 18n, {}, 0.5)).toBeCloseTo(1);
    expect(protocolHoldingUsd('cUstc', 0n, {}, null)).toBe(0);
    expect(protocolHoldingUsd('cUstc', null, { USTC: 0.01 }, null)).toBeNull();
  });
});

describe('applyImpliedLpLegUsd (USTR path used by holdings)', () => {
  it('does not invent USTR $1 without a priced peer', () => {
    const implied = applyImpliedLpLegUsd([
      ustrLeg(2000, null),
      {
        symbol: 'ALPHA',
        amountRaw: 1n,
        decimals: 6,
        kind: 'other',
        usd: null,
      },
    ]);
    const ustr = implied.find((leg) => leg.kind === 'ustr');
    expect(ustr?.usd).toBeNull();
  });
});
