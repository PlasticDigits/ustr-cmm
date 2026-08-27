import { describe, expect, it } from 'vitest';
import { formatPoolShare } from './format';

describe('formatPoolShare', () => {
  it('shows percent of pool and treats ~100% as 100%', () => {
    expect(formatPoolShare(0.985497)).toBe('98.55% of pool');
    expect(formatPoolShare(0.9743)).toBe('97.43% of pool');
    expect(formatPoolShare(0.99995)).toBe('100% of pool');
    expect(formatPoolShare(0.999999)).toBe('100% of pool');
    expect(formatPoolShare(1)).toBe('100% of pool');
  });

  it('does not round 99.99% up to 100%', () => {
    expect(formatPoolShare(0.99994)).toBe('99.99% of pool');
  });

  it('uses four decimals for tiny shares and zero for empty', () => {
    expect(formatPoolShare(0.0001234)).toBe('0.0123% of pool');
    expect(formatPoolShare(0)).toBe('0% of pool');
  });

  it('rejects non-finite / negative', () => {
    expect(formatPoolShare(null)).toBe('—');
    expect(formatPoolShare(undefined)).toBe('—');
    expect(formatPoolShare(Number.NaN)).toBe('—');
    expect(formatPoolShare(-0.1)).toBe('—');
  });
});
