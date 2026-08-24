import { describe, expect, it } from 'vitest';
import { CONTRACTS } from './constants';
import {
  aggregateProtocolOwned,
  claimRaw,
  computeAvailableSupply,
  protocolTokenIdFromLeg,
  toIssuanceBreakdown,
} from './availableSupply';

const pins = CONTRACTS.mainnet;

describe('claimRaw', () => {
  it('LP-only: 10% of 1000 UST1 reserve → 100 (floor)', () => {
    expect(claimRaw(1000n * 1_000_000n, 100_000n, 1_000_000n)).toBe(100n * 1_000_000n);
  });

  it('floors a non-divisible claim', () => {
    expect(claimRaw(1000n, 1n, 3n)).toBe(333n);
  });

  it('fail closed on zero-share or over-share', () => {
    expect(claimRaw(1000n, 1n, 0n)).toBeNull();
    expect(claimRaw(1000n, 5n, 4n)).toBeNull();
  });
});

describe('computeAvailableSupply', () => {
  it('spot-only: outstanding − treasury spot', () => {
    const result = computeAvailableSupply(1_000_000n, 250_000n);
    expect(result.available).toBe(750_000n);
    expect(result.inventoryKnown).toBe(true);
    expect(result.clamped).toBe(false);
  });

  it('CMM-owned 0 → available = outstanding', () => {
    expect(computeAvailableSupply(1_000_000n, 0n).available).toBe(1_000_000n);
  });

  it('CMM-owned exceeding outstanding clamps to 0 and fail-closes', () => {
    const result = computeAvailableSupply(100n, 150n);
    expect(result.available).toBe(0n);
    expect(result.clamped).toBe(true);
    expect(result.inventoryKnown).toBe(false);
  });

  it('unknown outstanding or owned → uncertified', () => {
    expect(computeAvailableSupply(null, 1n).inventoryKnown).toBe(false);
    expect(computeAvailableSupply(1n, null).inventoryKnown).toBe(false);
    expect(toIssuanceBreakdown(null, 1n).inventoryKnown).toBe(false);
  });
});

describe('aggregateProtocolOwned', () => {
  it('sums spot + unique LP claims once', () => {
    const owned = aggregateProtocolOwned(
      { ust1: 50n * 1_000_000n, ustr: 0n, cLunc: 0n, cUstc: 0n },
      [
        {
          lpAddress: 'terra1lp-a',
          lpBalance: 100_000n,
          totalShare: 1_000_000n,
          queryFailed: false,
          declaredProtocolIds: ['ust1'],
          legs: [
            { kind: 'ust1', address: pins.ust1Token, amountRaw: 1000n * 1_000_000n },
            { kind: 'other', amountRaw: 1n },
          ],
        },
        {
          lpAddress: 'terra1lp-a',
          lpBalance: 100_000n,
          totalShare: 1_000_000n,
          queryFailed: false,
          declaredProtocolIds: ['ust1'],
          legs: [{ kind: 'ust1', address: pins.ust1Token, amountRaw: 1000n * 1_000_000n }],
        },
      ]
    );
    // spot 50 + 10% of 1000 = 100 → 150 whole UST1 (6dp)
    expect(owned.ust1).toBe(150n * 1_000_000n);
  });

  it('failed pool with lp_balance > 0 poisons declared protocol ids', () => {
    const owned = aggregateProtocolOwned(
      { ust1: 1n, ustr: 2n, cLunc: 3n, cUstc: 4n },
      [
        {
          lpAddress: 'terra1lp-b',
          lpBalance: 1n,
          totalShare: null,
          queryFailed: true,
          declaredProtocolIds: ['ust1', 'ustr'],
          legs: null,
        },
      ]
    );
    expect(owned.ust1).toBeNull();
    expect(owned.ustr).toBeNull();
    expect(owned.cLunc).toBe(3n);
    expect(owned.cUstc).toBe(4n);
  });

  it('USTR 18dp claims stay in raw units (no Number(bigint))', () => {
    const reserve = 2000n * 10n ** 18n;
    const owned = aggregateProtocolOwned(
      { ust1: 0n, ustr: 0n, cLunc: 0n, cUstc: 0n },
      [
        {
          lpAddress: 'terra1lp-c',
          lpBalance: 100_000n,
          totalShare: 1_000_000n,
          queryFailed: false,
          declaredProtocolIds: ['ustr'],
          legs: [{ kind: 'ustr', address: pins.ustrToken, amountRaw: reserve }],
        },
      ]
    );
    expect(owned.ustr).toBe(200n * 10n ** 18n);
  });
});

describe('protocolTokenIdFromLeg', () => {
  it('maps pinned addresses only — lookalike wrap is not a protocol id', () => {
    expect(protocolTokenIdFromLeg('ust1', pins.ust1Token)).toBe('ust1');
    expect(protocolTokenIdFromLeg('ustr', pins.ustrToken)).toBe('ustr');
    expect(protocolTokenIdFromLeg('wrap', pins.cLunc)).toBe('cLunc');
    expect(protocolTokenIdFromLeg('wrap', pins.cUstc)).toBe('cUstc');
    expect(protocolTokenIdFromLeg('wrap', 'terra1fakecustcxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBeNull();
    expect(protocolTokenIdFromLeg('other', pins.vfdusd)).toBeNull();
  });
});
