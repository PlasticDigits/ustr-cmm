import { describe, expect, it } from 'vitest';
import { parseDexPoolState } from './lpPoolParse';

const GARUDA_USTRIX = {
  asset1: { cw20: 'terra1r3eaa2tucjr3es88wzuqpgxvssqflk9cghrjmf9uneds8wljyapqwtrcp5' },
  asset2: { native: 'uluna' },
  reserve1: '1562493610',
  reserve2: '9198484494710',
  total_supply: '119123424640',
  liquidity_token: 'terra14ykw7pd8pmw92asn7jmgwjc853w3xcse2uy72e8a5xndak8d5gjstcdfn6',
};

const TERRAPORT_SPACE = {
  assets: [
    {
      info: { token: { contract_addr: 'terra1cvd5cgrs8rrl96hte34n57497u5f9cwuv3e6ztxgetkx4uzmcdyswv79zl' } },
      amount: '69514899',
    },
    {
      info: { native_token: { denom: 'uluna' } },
      amount: '1483424332952',
    },
  ],
  total_share: '9966829339',
};

describe('parseDexPoolState', () => {
  it('parses Garuda pool + separate liquidity_token', () => {
    const parsed = parseDexPoolState('garuda', GARUDA_USTRIX);
    expect(parsed?.totalShare).toBe(119123424640n);
    expect(parsed?.liquidityToken).toBe('terra14ykw7pd8pmw92asn7jmgwjc853w3xcse2uy72e8a5xndak8d5gjstcdfn6');
    expect(parsed?.reserves[0]?.address).toContain('terra1r3eaa');
    expect(parsed?.reserves[1]?.denom).toBe('uluna');
    expect(parsed?.reserves[0]?.amountRaw).toBe(1562493610n);
  });

  it('parses Terraport/Terraswap assets + total_share', () => {
    const parsed = parseDexPoolState('terraport', TERRAPORT_SPACE);
    expect(parsed?.totalShare).toBe(9966829339n);
    expect(parsed?.liquidityToken).toBeUndefined();
    expect(parsed?.reserves[1]?.denom).toBe('uluna');
    expect(parseDexPoolState('terraswap', TERRAPORT_SPACE)?.totalShare).toBe(9966829339n);
  });

  it('parses CL8Y pool like Terraswap and keeps pair.liquidity_token', () => {
    const parsed = parseDexPoolState('cl8y', {
      ...TERRAPORT_SPACE,
      liquidity_token: 'terra1ak8w9k34ex237h9pmquxqjevhzvflqaatuaj9pr8ym287n7atj6qw2ty4p',
    });
    expect(parsed?.totalShare).toBe(9966829339n);
    expect(parsed?.liquidityToken).toBe('terra1ak8w9k34ex237h9pmquxqjevhzvflqaatuaj9pr8ym287n7atj6qw2ty4p');
    expect(parsed?.reserves[0]?.address).toContain('terra1cvd5c');
  });

  it('unknown dex or garbage → null (fail closed)', () => {
    expect(parseDexPoolState('astroport', GARUDA_USTRIX)).toBeNull();
    expect(parseDexPoolState('garuda', { reserve1: '-1' })).toBeNull();
    expect(parseDexPoolState('garuda', null)).toBeNull();
    expect(parseDexPoolState('terraport', { assets: [], total_share: '1' })).toBeNull();
  });
});
