import { describe, expect, it } from 'vitest';
import {
  KEPLR_COMPATIBLE_COPY,
  ensureKeplrCompatibleProvider,
  getKeplrCompatibleProvider,
  isKeplrCompatibleInstalled,
  isTrustWalletEnvironment,
  type KeplrLikeProvider,
} from './keplrCompatible';

function stubProvider(): KeplrLikeProvider {
  return {
    enable: async () => undefined,
    getOfflineSigner: () => ({}),
  };
}

describe('getKeplrCompatibleProvider / isKeplrCompatibleInstalled', () => {
  it('is absent without window or injects', () => {
    expect(getKeplrCompatibleProvider(undefined)).toBeUndefined();
    expect(isKeplrCompatibleInstalled(undefined)).toBe(false);
    expect(getKeplrCompatibleProvider({})).toBeUndefined();
    expect(isKeplrCompatibleInstalled({})).toBe(false);
  });

  it('accepts window.keplr (Keplr and wallets that alias it, including some Trust builds)', () => {
    const keplr = stubProvider();
    const win = { keplr };
    expect(getKeplrCompatibleProvider(win)).toBe(keplr);
    expect(isKeplrCompatibleInstalled(win)).toBe(true);
  });

  it('accepts window.trustwallet.cosmos when window.keplr is missing (Trust official inject)', () => {
    const cosmos = stubProvider();
    const win = { trustwallet: { cosmos } };
    expect(getKeplrCompatibleProvider(win)).toBe(cosmos);
    expect(isKeplrCompatibleInstalled(win)).toBe(true);
  });

  it('prefers window.keplr when both are present', () => {
    const keplr = stubProvider();
    const cosmos = stubProvider();
    expect(getKeplrCompatibleProvider({ keplr, trustwallet: { cosmos } })).toBe(keplr);
  });
});

describe('ensureKeplrCompatibleProvider', () => {
  it('is a no-op when keplr is already present', () => {
    const keplr = stubProvider();
    const cosmos = stubProvider();
    const win = { keplr, trustwallet: { cosmos } };
    expect(ensureKeplrCompatibleProvider(win)).toBe(true);
    expect(win.keplr).toBe(keplr);
  });

  it('aliases trustwallet.cosmos onto window.keplr for KeplrController', () => {
    const cosmos = stubProvider();
    const win: { keplr?: KeplrLikeProvider; trustwallet: { cosmos: KeplrLikeProvider } } = {
      trustwallet: { cosmos },
    };
    expect(ensureKeplrCompatibleProvider(win)).toBe(true);
    expect(win.keplr).toBe(cosmos);
  });

  it('returns false when neither inject exists', () => {
    expect(ensureKeplrCompatibleProvider(undefined)).toBe(false);
    expect(ensureKeplrCompatibleProvider({})).toBe(false);
    expect(ensureKeplrCompatibleProvider({ trustwallet: {} })).toBe(false);
  });
});

describe('isTrustWalletEnvironment', () => {
  it('is not implied by an empty window (desktop Keplr is branding-neutral)', () => {
    expect(isTrustWalletEnvironment(undefined)).toBe(false);
    expect(isTrustWalletEnvironment({})).toBe(false);
  });

  it('detects Trust branding signals without requiring cosmos inject', () => {
    expect(isTrustWalletEnvironment({ trustwallet: {} })).toBe(true);
    expect(isTrustWalletEnvironment({ ethereum: { isTrust: true } })).toBe(true);
    expect(isTrustWalletEnvironment({ ethereum: { isTrustWallet: true } })).toBe(true);
  });
});

describe('KEPLR_COMPATIBLE_COPY', () => {
  it('names Trust Wallet and the in-app browser path', () => {
    expect(KEPLR_COMPATIBLE_COPY.keplrAvailable).toMatch(/Trust Wallet/i);
    expect(KEPLR_COMPATIBLE_COPY.trustMissing).toMatch(/dApp browser/i);
    expect(KEPLR_COMPATIBLE_COPY.modalHint).toMatch(/in-app browser/i);
    expect(KEPLR_COMPATIBLE_COPY.docsHref).toContain('docs/WALLETS.md');
    expect(KEPLR_COMPATIBLE_COPY.missingProviderError).toMatch(/Trust Wallet/i);
  });
});
