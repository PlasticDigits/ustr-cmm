import { describe, expect, it } from 'vitest';
import { formatPoolShare } from './format';

describe('formatPoolShare', () => {
  it('shows percent of pool and treats ~100% as 100%', () => {
    expect(formatPoolShare(0.985497)).toBe('98.55% of pool');
    expect(formatPoolShare(0.999999)).toBe('100% of pool');
    expect(formatPoolShare(1)).toBe('100% of pool');
  });

  it('rejects non-finite / negative', () => {
    expect(formatPoolShare(null)).toBe('—');
    expect(formatPoolShare(Number.NaN)).toBe('—');
    expect(formatPoolShare(-0.1)).toBe('—');
  });
});
