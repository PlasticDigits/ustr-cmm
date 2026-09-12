import { describe, expect, it } from 'vitest';
import { CONTRACTS } from './constants';
import {
  classifyLpLeg,
  isCrEligibleLeg,
  isExactSkipHoldingSymbol,
  isRawProtocolHolding,
  isSupportedLpDex,
  resolveLpLegUsd,
} from './lpEligibility';
import type { TokenListEntry } from '../types/tokenlist';

const pins = CONTRACTS.mainnet;

function entry(partial: Partial<TokenListEntry> & Pick<TokenListEntry, 'symbol' | 'type'>): TokenListEntry {
  return {
    name: partial.symbol,
    decimals: 6,
    gradient: '',
    iconColor: '',
    ...partial,
  };
}

describe('holding skip list', () => {
  it('matches exact protocol symbols only — not UST1-USTR', () => {
    expect(isExactSkipHoldingSymbol('UST1')).toBe(true);
    expect(isExactSkipHoldingSymbol('ustr')).toBe(true);
    expect(isExactSkipHoldingSymbol('CLUNC')).toBe(true);
    expect(isExactSkipHoldingSymbol('CUSTC')).toBe(true);
    expect(isExactSkipHoldingSymbol('UST1-USTR')).toBe(false);
    expect(isExactSkipHoldingSymbol('UST1-SpaceUSD')).toBe(false);
    expect(isExactSkipHoldingSymbol('CL8Y-cb-cUSTC')).toBe(false);
    expect(isExactSkipHoldingSymbol('CL8Y-cb-ALPHA')).toBe(false);
    expect(isExactSkipHoldingSymbol('UST1-ALPHA')).toBe(false);
    expect(isExactSkipHoldingSymbol('cLUNC-cUSTC')).toBe(false);
    expect(isExactSkipHoldingSymbol('cLUNC-USDT')).toBe(false);
    expect(isExactSkipHoldingSymbol('UST1/USTR')).toBe(false);
  });

  it('does not skip type:lp even if symbol contains UST1', () => {
    expect(
      isRawProtocolHolding(
        entry({
          symbol: 'UST1-USTR',
          type: 'lp',
          address: 'terra1lpsharexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        })
      )
    ).toBe(false);
  });

  it('skips raw UST1 / USTR / wraps by symbol and pinned address', () => {
    expect(isRawProtocolHolding(entry({ symbol: 'UST1', type: 'cw20', address: pins.ust1Token }))).toBe(true);
    expect(isRawProtocolHolding(entry({ symbol: 'USTR', type: 'cw20', address: pins.ustrToken }))).toBe(true);
    expect(isRawProtocolHolding(entry({ symbol: 'cLUNC', type: 'cw20', address: pins.cLunc }))).toBe(true);
    expect(isRawProtocolHolding(entry({ symbol: 'ALPHA', type: 'cw20', address: 'terra1x6e64es6yhauhvs3prvpdg2gkqdtfru840wgnhs935x8axr7zxkqzysuxz' }))).toBe(false);
  });
});

describe('classifyLpLeg', () => {
  const known = new Set([pins.vfdusd]);

  it('pins UST1 / USTR / wraps by address, not lookalike symbols', () => {
    expect(classifyLpLeg({ symbol: 'UST1', address: pins.ust1Token }, known)).toBe('ust1');
    expect(classifyLpLeg({ symbol: 'USTR', address: pins.ustrToken }, known)).toBe('ustr');
    expect(classifyLpLeg({ symbol: 'cUSTC', address: pins.cUstc }, known)).toBe('wrap');
    expect(classifyLpLeg({ symbol: 'cUSTC', address: 'terra1fakecustcxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }, known)).toBe(
      'unknown'
    );
    expect(classifyLpLeg({ symbol: 'LUNC', denom: 'uluna' }, known)).toBe('other');
    expect(classifyLpLeg({ symbol: 'vFDUSD', address: pins.vfdusd }, known)).toBe('other');
    expect(
      classifyLpLeg(
        {
          symbol: 'CL8Y-cb',
          address: 'terra16wtml2q66g82fdkx66tap0qjkahqwp4lwq3ngtygacg5q0kzycgqvhpax3',
        },
        new Set([...known, 'terra16wtml2q66g82fdkx66tap0qjkahqwp4lwq3ngtygacg5q0kzycgqvhpax3'])
      )
    ).toBe('other');
    expect(
      classifyLpLeg(
        {
          symbol: 'CL8Y-cb',
          address: 'terra16wtml2q66g82fdkx66tap0qjkahqwp4lwq3ngtygacg5q0kzycgqvhpax3',
        },
        known
      )
    ).toBe('unknown');
    expect(
      classifyLpLeg(
        {
          symbol: 'USDT',
          address: 'terra1z0xe7t5ymmltg4vju8tghkq0pewy4et548ta23nlu9zxtl950uyqkv8mv4',
        },
        new Set([...known, 'terra1z0xe7t5ymmltg4vju8tghkq0pewy4et548ta23nlu9zxtl950uyqkv8mv4'])
      )
    ).toBe('other');
  });

  it('CR eligibility: other only — ust1/ustr/wrap/unknown are out (#16)', () => {
    expect(isCrEligibleLeg('ust1')).toBe(false);
    expect(isCrEligibleLeg('ustr')).toBe(false);
    expect(isCrEligibleLeg('other')).toBe(true);
    expect(isCrEligibleLeg('wrap')).toBe(false);
    expect(isCrEligibleLeg('unknown')).toBe(false);
  });
});

describe('resolveLpLegUsd', () => {
  it('UST1 is always $1; never uses a DEX print', () => {
    expect(resolveLpLegUsd('ust1', 'UST1', { UST1: 0.7 })).toBe(1);
  });

  it('wraps use native LUNC/USTC; others use the map; no $1 invent', () => {
    expect(resolveLpLegUsd('wrap', 'cLUNC', { LUNC: 0.0001 })).toBe(0.0001);
    expect(resolveLpLegUsd('wrap', 'cUSTC', {})).toBeNull();
    expect(resolveLpLegUsd('ustr', 'USTR', {})).toBeNull();
    expect(resolveLpLegUsd('other', 'vFDUSD', {})).toBeNull();
    expect(resolveLpLegUsd('other', 'vFDUSD', { vFDUSD: 1.22 })).toBe(1.22);
    expect(resolveLpLegUsd('other', 'USDT', {})).toBeNull();
    expect(resolveLpLegUsd('other', 'USDT', { USDT: 1.01 })).toBe(1.01);
  });
});

describe('isSupportedLpDex', () => {
  it('allowlists cl8y/garuda/terraswap/terraport only', () => {
    expect(isSupportedLpDex('cl8y')).toBe(true);
    expect(isSupportedLpDex('garuda')).toBe(true);
    expect(isSupportedLpDex('Terraport')).toBe(true);
    expect(isSupportedLpDex('astroport')).toBe(false);
    expect(isSupportedLpDex('')).toBe(false);
  });
});
