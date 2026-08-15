import { describe, expect, it } from 'vitest';
import {
  readVfdusdSessionPrice,
  sanitizeVfdusdUsd,
  vfdusdUsdFromOracleState,
  vfdusdUsdFromRateString,
  writeVfdusdSessionPrice,
} from './vfdusdOracle';
import { VFDUSD_ORACLE } from './constants';

describe('vfdusdUsdFromRateString', () => {
  it('converts live-scale 1.2256e18 without Number(bigint) precision loss', () => {
    const usd = vfdusdUsdFromRateString('1225611462101223983');
    expect(usd).not.toBeNull();
    expect(usd!).toBeGreaterThan(1.22);
    expect(usd!).toBeLessThan(1.23);
  });

  it('rejects zero, non-numeric, and empty', () => {
    expect(vfdusdUsdFromRateString('0')).toBeNull();
    expect(vfdusdUsdFromRateString('')).toBeNull();
    expect(vfdusdUsdFromRateString('12.3')).toBeNull();
    expect(vfdusdUsdFromRateString('-1')).toBeNull();
  });

  it('rejects out-of-band rates (MITM / garbage R)', () => {
    expect(vfdusdUsdFromRateString('1')).toBeNull(); // ~0
    expect(vfdusdUsdFromRateString('100000000000000000000')).toBeNull(); // 100
  });
});

describe('vfdusdUsdFromOracleState', () => {
  it('reads `rate` (on-chain field) and `R` (issue wording)', () => {
    expect(vfdusdUsdFromOracleState({ rate: '1225611462101223983', paused: false })).toBeGreaterThan(1);
    expect(vfdusdUsdFromOracleState({ R: '1225611462101223983', paused: false })).toBeGreaterThan(1);
  });

  it('hides USD when paused or missing rate', () => {
    expect(vfdusdUsdFromOracleState({ rate: '1225611462101223983', paused: true })).toBeNull();
    expect(vfdusdUsdFromOracleState({ paused: false })).toBeNull();
    expect(vfdusdUsdFromOracleState(null)).toBeNull();
  });
});

describe('sanitizeVfdusdUsd / session cache', () => {
  it('rejects tampered huge USD and wrong schema', () => {
    expect(sanitizeVfdusdUsd(100000)).toBeNull();
    expect(sanitizeVfdusdUsd(1)).toBe(1);

    const store: Record<string, string> = {};
    const fake: Storage = {
      get length() { return Object.keys(store).length; },
      clear() { Object.keys(store).forEach((k) => delete store[k]); },
      getItem(key) { return store[key] ?? null; },
      key() { return null; },
      removeItem(key) { delete store[key]; },
      setItem(key, value) { store[key] = value; },
    };

    writeVfdusdSessionPrice({
      v: VFDUSD_ORACLE.sessionSchemaVersion,
      status: 'ok',
      usd: 100000,
      rate: '1',
      fetchedAt: 1,
    }, fake);
    expect(readVfdusdSessionPrice(fake).status).toBe('miss');

    fake.setItem('ustr-cmm:vfdusd-oracle:v1', JSON.stringify({ v: 99, status: 'ok', usd: 1.2, rate: '1' }));
    expect(readVfdusdSessionPrice(fake).status).toBe('miss');

    writeVfdusdSessionPrice({
      v: VFDUSD_ORACLE.sessionSchemaVersion,
      status: 'ok',
      usd: 1.22,
      rate: '1225611462101223983',
      fetchedAt: 1,
    }, fake);
    const ok = readVfdusdSessionPrice(fake);
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(ok.usd).toBe(1.22);

    writeVfdusdSessionPrice({
      v: VFDUSD_ORACLE.sessionSchemaVersion,
      status: 'unavailable',
      reason: 'paused',
      fetchedAt: 1,
    }, fake);
    expect(readVfdusdSessionPrice(fake)).toEqual({ status: 'unavailable', reason: 'paused' });
  });
});
