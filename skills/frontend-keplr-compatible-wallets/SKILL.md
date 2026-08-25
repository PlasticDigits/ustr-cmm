---
name: frontend-keplr-compatible-wallets
description: >-
  Keplr-compatible injects including Trust Wallet (GitLab #4). Use when
  changing WalletButton connect rows, keplrCompatible.ts, isKeplrInstalled,
  or WalletName.KEPLR / KeplrController wiring.
---

# Frontend Keplr-compatible wallets / Trust Wallet (#4)

Companion: [#4](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/4). Device / inject QA leftover: [#18](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/18). Human docs: [docs/WALLETS.md](../../docs/WALLETS.md).

Cross-links: [frontend/src/services/keplrCompatible.ts](../../frontend/src/services/keplrCompatible.ts), [frontend/src/services/wallet.ts](../../frontend/src/services/wallet.ts), [frontend/src/components/common/WalletButton.tsx](../../frontend/src/components/common/WalletButton.tsx), [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Why this exists

Users in **Trust Wallet** (and similar mobile Cosmos browsers) did not see a Trust row. They can connect only because those wallets inject a **Keplr-shaped** provider. There is no Trust `WalletName` in cosmes.

Trust’s own docs prefer `window.trustwallet.cosmos` over `window.keplr`. Some builds alias `window.keplr` (the original report); some may not. Detection must accept both.

## Invariants (must hold)

1. **One connect path.** Trust and Keplr UI rows call `connect(WalletName.KEPLR, WalletType.EXTENSION)`. Do **not** add a Trust `WalletName`, Trust WalletConnect pair, or a second cosmes controller for Trust.
2. **Detect either inject.** `isKeplrInstalled` / availability is `window.keplr` **or** `window.trustwallet.cosmos` (`getKeplrCompatibleProvider`). Do not treat “no `window.keplr`” as “Trust cannot connect.”
3. **Alias, do not overwrite.** `ensureKeplrCompatibleProvider()` may set `window.keplr = window.trustwallet.cosmos` only when `window.keplr` is missing. Never replace a real Keplr inject. Call this before `KeplrController.connect` / `experimentalSuggestChain`.
4. **Branding ≠ provider.** `window.trustwallet` / `ethereum.isTrust` is environment hint only. A Trust session that only sets `window.keplr` is valid.
5. **Terra Classic, not EVM.** Copy must not send users to Trust’s BSC / Ethereum flow. This app is `columbus-5`.
6. **Discoverability.** Keep a Trust-labeled row and helper/footer copy pointing at the in-app browser + [docs/WALLETS.md](../../docs/WALLETS.md). Do not hide Trust behind the word “Keplr” only.
7. **No new secrets / WC project for Trust.** Reuse the existing Keplr extension path.

## Pins (do not invent)

| Item | Value |
|------|--------|
| Connect | `WalletName.KEPLR` + `WalletType.EXTENSION` |
| Cosmes | `KeplrController` |
| Trust Cosmos inject | `window.trustwallet.cosmos` (Keplr API) |
| Docs URL in UI | `KEPLR_COMPATIBLE_COPY.docsHref` → `docs/WALLETS.md` on GitLab `master` |

## Tests

```bash
cd frontend && npm test
```

Covers provider preference, Trust-only inject alias, no-overwrite, and copy that names Trust / in-app browser.
