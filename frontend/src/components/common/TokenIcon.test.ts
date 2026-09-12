import { describe, expect, it } from 'vitest';
import { tokenIconFileStem } from './tokenIconFileStem';

describe('tokenIconFileStem', () => {
  it('maps CMM CL8Y-cb to the DEX catalog CL8Y.png stem', () => {
    expect(tokenIconFileStem('CL8Y-cb')).toBe('CL8Y');
    expect(tokenIconFileStem('cl8y-cb')).toBe('CL8Y');
  });

  it('leaves other symbols as uppercase filenames', () => {
    expect(tokenIconFileStem('cUSTC')).toBe('CUSTC');
    expect(tokenIconFileStem('USDT')).toBe('USDT');
    expect(tokenIconFileStem('SpaceUSD')).toBe('SPACEUSD');
    expect(tokenIconFileStem('CL8Y')).toBe('CL8Y');
  });
});
