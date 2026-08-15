import { describe, expect, it } from 'vitest';
import { LEGAL_CLICKWRAP } from './constants';
import { getLegalProperty, getLegalRedirectAllowlist, resolveLegalRedirectUri } from './legalClickwrap';

describe('legalClickwrap', () => {
  it('defaults property to ust1cmm.com and never cl8y.com / dex.cl8y.com', () => {
    expect(getLegalProperty()).toBe('ust1cmm.com');
    expect(getLegalProperty()).not.toBe('cl8y.com');
    expect(getLegalProperty()).not.toBe('dex.cl8y.com');
    expect(LEGAL_CLICKWRAP.network).toBe('TerraClassic');
  });

  it('allowlists only https://ust1cmm.com', () => {
    expect(getLegalRedirectAllowlist()).toEqual(['https://ust1cmm.com']);
  });

  it('accepts production origin path (incl. /swap/code) and rejects evil / localhost in prod', () => {
    const ok = resolveLegalRedirectUri('https://ust1cmm.com/swap/abc', true);
    expect(ok).toBe('https://ust1cmm.com/swap/abc');

    expect(resolveLegalRedirectUri('https://evil.example/phish', true)).toBeNull();
    expect(resolveLegalRedirectUri('http://localhost:5173/', true)).toBeNull();
    expect(resolveLegalRedirectUri('http://localhost:5173/', false)).toBe('http://localhost:5173/');
  });
});
