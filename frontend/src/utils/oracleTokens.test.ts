import { describe, expect, it } from 'vitest';
import { CONTRACTS } from './constants';
import { isVfdusdToken } from './oracleTokens';

describe('isVfdusdToken', () => {
  it('matches symbol case-insensitively and pinned mainnet address', () => {
    expect(isVfdusdToken('vFDUSD')).toBe(true);
    expect(isVfdusdToken('VFDUSD')).toBe(true);
    expect(isVfdusdToken('ALPHA')).toBe(false);
    expect(isVfdusdToken('ALPHA', CONTRACTS.mainnet.vfdusd)).toBe(true);
    expect(isVfdusdToken('vFDUSD', 'terra1notvfdusdxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
  });
});
