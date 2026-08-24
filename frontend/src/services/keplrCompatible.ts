/**
 * Keplr-compatible injected providers (GitLab #4).
 *
 * Cosmes `KeplrController` reads `window.keplr`. Trust Wallet's in-app browser
 * may inject that alias, or only `window.trustwallet.cosmos` (Keplr-shaped).
 * There is no separate Trust controller — both UI rows call WalletName.KEPLR.
 *
 * @see ../../../docs/WALLETS.md
 * @see ../../../skills/frontend-keplr-compatible-wallets/SKILL.md
 */

export type KeplrLikeProvider = {
  enable: (chainId: string) => Promise<void>;
  getOfflineSigner: (chainId: string) => unknown;
  experimentalSuggestChain?: (chainInfo: unknown) => Promise<void>;
};

declare global {
  interface Window {
    keplr?: KeplrLikeProvider;
    trustwallet?: {
      cosmos?: KeplrLikeProvider;
      ethereum?: { isTrust?: boolean };
    };
    ethereum?: {
      isTrust?: boolean;
      isTrustWallet?: boolean;
    };
  }
}

/** Human + modal copy. Keep in sync with docs/WALLETS.md. */
export const KEPLR_COMPATIBLE_COPY = {
  keplrAvailable: 'Also Trust Wallet and other Keplr-compatible in-app browsers',
  keplrMissing: 'Install Keplr, or open this site in a compatible in-app browser',
  trustAvailable: 'Same connection as Keplr — Trust injects a compatible provider',
  trustMissing: "Open this site in Trust Wallet's dApp browser (not Safari/Chrome)",
  modalHint:
    'Mobile multi-chain wallets: open ust1cmm.com inside the wallet’s in-app browser, then tap Keplr or Trust Wallet.',
  docsHref: 'https://gitlab.com/PlasticDigits2/ustr-cmm/-/blob/master/docs/WALLETS.md',
  docsLabel: 'Mobile wallet help',
  missingProviderError:
    'No Keplr-compatible wallet found. Install the Keplr extension, or open this site in Trust Wallet’s dApp browser.',
} as const;

/**
 * Prefer `window.keplr` (Keplr + wallets that alias it). Fall back to Trust’s
 * official Cosmos inject, which may exist without `window.keplr`.
 */
export function getKeplrCompatibleProvider(
  win: Pick<Window, 'keplr' | 'trustwallet'> | undefined = typeof window === 'undefined' ? undefined : window
): KeplrLikeProvider | undefined {
  if (!win) return undefined;
  return win.keplr ?? win.trustwallet?.cosmos;
}

export function isKeplrCompatibleInstalled(
  win: Pick<Window, 'keplr' | 'trustwallet'> | undefined = typeof window === 'undefined' ? undefined : window
): boolean {
  return !!getKeplrCompatibleProvider(win);
}

/**
 * Trust branding / environment — not required for the connect path.
 * Used only for copy and tests. A Trust dApp session that only sets
 * `window.keplr` is still a valid Keplr-compatible session.
 */
export function isTrustWalletEnvironment(
  win: Pick<Window, 'trustwallet' | 'ethereum'> | undefined = typeof window === 'undefined' ? undefined : window
): boolean {
  if (!win) return false;
  return !!(win.trustwallet || win.ethereum?.isTrust || win.ethereum?.isTrustWallet);
}

/**
 * Alias Trust’s Cosmos provider onto `window.keplr` so KeplrController works.
 * Never overwrites an existing `window.keplr`.
 *
 * @returns true when a Keplr-shaped provider is visible as `window.keplr`
 */
export function ensureKeplrCompatibleProvider(
  win: (Pick<Window, 'keplr' | 'trustwallet'> & { keplr?: KeplrLikeProvider }) | undefined =
    typeof window === 'undefined' ? undefined : window
): boolean {
  if (!win) return false;
  if (win.keplr) return true;
  const trustCosmos = win.trustwallet?.cosmos;
  if (!trustCosmos) return false;
  win.keplr = trustCosmos;
  return true;
}
