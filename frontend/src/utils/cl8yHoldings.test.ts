import { describe, expect, it } from 'vitest';
import {
  diffCl8yCatalog,
  heldUnpinnedPins,
  parseCl8yPairsPage,
  tokenlistCl8yPins,
  type Cl8yIndexerPair,
} from './cl8yHoldings';
import type { TokenListEntry } from '../types/tokenlist';

const UST1_USTR: Cl8yIndexerPair = {
  pair_address: 'terra16vxrhpvpcucu05y0nr862vf9hnqeh274uaff4s7hz4n0ea74006qf5hgqy',
  lp_token: 'terra1ak8w9k34ex237h9pmquxqjevhzvflqaatuaj9pr8ym287n7atj6qw2ty4p',
  asset_0: { symbol: 'UST1', contract_addr: 'terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72', denom: null, decimals: 6 },
  asset_1: { symbol: 'USTR', contract_addr: 'terra1vy3kc0swag2rhn7jz6n72jp0l2ns0p6r6ez5grxq5uhj2rvs97fqfsetxv', denom: null, decimals: 18 },
};

const CLUNC_UST1: Cl8yIndexerPair = {
  pair_address: 'terra1su5363453fj326u4t0kqar30f35cm3n0dc9yksg379u6875z350s4mm7h4',
  lp_token: 'terra1mk3krh8pk9wslqhasessk8rydqs4y9krprfgtnssfxr3l23pvgqsp2cagk',
  asset_0: { symbol: 'cLUNC', contract_addr: 'terra1437qslye72t7qmmahn4t5chz50r8a62g45phwkquwpyu2l62u6ksqssgdg', denom: null, decimals: 6 },
  asset_1: { symbol: 'UST1', contract_addr: 'terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72', denom: null, decimals: 6 },
};

const pins = [
  {
    symbol: 'UST1-USTR',
    pairAddress: UST1_USTR.pair_address,
    lpAddress: UST1_USTR.lp_token,
    dex: 'cl8y',
  },
];

describe('parseCl8yPairsPage', () => {
  it('fail closed on a non-page payload', () => {
    expect(parseCl8yPairsPage(null)).toBeNull();
    expect(parseCl8yPairsPage([])).toBeNull();
    expect(parseCl8yPairsPage({ pairs: [] })).toBeNull();
  });

  it('keeps well-formed items and drops garbage rows', () => {
    const page = parseCl8yPairsPage({
      items: [UST1_USTR, { pair_address: 'nope' }, { foo: 1 }],
      total: 3,
      limit: 100,
      offset: 0,
    });
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0].lp_token).toBe(UST1_USTR.lp_token);
    expect(page?.total).toBe(3);
  });
});

describe('tokenlistCl8yPins', () => {
  it('takes type:lp cl8y rows only — never factory crawl, never spot CW20', () => {
    const tokens: TokenListEntry[] = [
      {
        symbol: 'ALPHA',
        name: 'Alpha',
        type: 'cw20',
        address: 'terra1x6e64es6yhauhvs3prvpdg2gkqdtfru840wgnhs935x8axr7zxkqzysuxz',
        decimals: 6,
        gradient: '',
        iconColor: '',
      },
      {
        symbol: 'UST1-USTR',
        name: 'UST1/USTR LP',
        type: 'lp',
        address: UST1_USTR.lp_token,
        decimals: 18,
        gradient: '',
        iconColor: '',
        pool: {
          address: UST1_USTR.pair_address,
          dex: 'cl8y',
          assets: [],
        },
      },
      {
        symbol: 'OTHER-LP',
        name: 'Garuda',
        type: 'lp',
        address: 'terra1ak8w9k34ex237h9pmquxqjevhzvflqaatuaj9pr8ym287n7atj6qw2ty4p',
        decimals: 18,
        gradient: '',
        iconColor: '',
        pool: { address: UST1_USTR.pair_address, dex: 'garuda' },
      },
    ];
    expect(tokenlistCl8yPins(tokens)).toEqual([
      {
        symbol: 'UST1-USTR',
        pairAddress: UST1_USTR.pair_address,
        lpAddress: UST1_USTR.lp_token,
        dex: 'cl8y',
      },
    ]);
  });
});

describe('diffCl8yCatalog', () => {
  it('classifies pinned vs unpinned catalog rows without inventing holds', () => {
    const diff = diffCl8yCatalog([UST1_USTR, CLUNC_UST1], pins);
    expect(diff.pinned.map((r) => r.label)).toEqual(['UST1/USTR']);
    expect(diff.unpinned.map((r) => r.label)).toEqual(['cLUNC/UST1']);
    expect(diff.pinsMissingFromCatalog).toEqual([]);
    expect(diff.invalid).toEqual([]);
  });

  it('does not treat indexer catalog as a hold — unpinned + zero LCD stays unpinned', () => {
    const diff = diffCl8yCatalog([CLUNC_UST1], pins);
    expect(heldUnpinnedPins(diff.unpinned, new Map())).toEqual([]);
    expect(
      heldUnpinnedPins(diff.unpinned, new Map([[CLUNC_UST1.lp_token, 0n]]))
    ).toEqual([]);
    expect(
      heldUnpinnedPins(diff.unpinned, new Map([[CLUNC_UST1.lp_token, 1n]]))
    ).toHaveLength(1);
  });

  it('flags a pin whose pair is absent from the catalog (pin stays; do not drop)', () => {
    const diff = diffCl8yCatalog([], pins);
    expect(diff.pinsMissingFromCatalog).toEqual(pins);
  });
});
