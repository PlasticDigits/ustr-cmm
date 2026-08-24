# Connecting wallets (Terra Classic)

Companion: [#4](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/4). Agent playbook: [skills/frontend-keplr-compatible-wallets](../skills/frontend-keplr-compatible-wallets/SKILL.md).

This site (`ust1cmm.com`) talks to **Terra Classic** (`columbus-5`). It is not a BSC / EVM dApp. Use a Cosmos-capable wallet, not Trust’s Ethereum / BNB “DApp” slot.

## Trust Wallet (and other multi-chain mobile wallets)

Trust Wallet has **no separate CMM integration**. The working path is the same **Keplr-compatible inject** used for Keplr:

1. In Trust Wallet, open the **in-app / dApp browser** (not Safari, Chrome, or an external tab).
2. Go to `https://ust1cmm.com`.
3. Tap **Connect Wallet**, then **Keplr** or **Trust Wallet**. Both buttons call `connect(WalletName.KEPLR, WalletType.EXTENSION)`.

Do **not** expect a Trust-only WalletConnect row. LUNC Dash / Galaxy Station in the modal are WalletConnect; Trust is not wired there.

### Why Keplr appears to “be” Trust

Availability is “any Keplr-shaped inject,” not “the Keplr extension is installed”:

| Inject | Who sets it | Enough to connect? |
|--------|-------------|--------------------|
| `window.keplr` | Keplr, and some Trust / mobile builds that alias Keplr | Yes |
| `window.trustwallet.cosmos` | Trust Wallet in-app browser ([Trust docs](https://developer.trustwallet.com/developer/listing-guide/mobile-optimize): use this instead of `window.keplr`) | Yes, after we alias it onto `window.keplr` |

`KeplrController` (cosmes) only reads `window.keplr`. If Trust injects only `window.trustwallet.cosmos`, we copy that object onto `window.keplr` **when `window.keplr` is missing**. We never overwrite a real Keplr inject.

A session that only sets `window.keplr` (the original #4 report: Keplr row worked inside Trust) is already valid. Branding flags (`window.trustwallet`, `ethereum.isTrust`) are **not** required for connect.

## Other injected wallets

Station, Leap, and Cosmostation use their own `window.*` providers. They are not aliases of Keplr.

## Invariants

See [skills/frontend-keplr-compatible-wallets](../skills/frontend-keplr-compatible-wallets/SKILL.md). Code: [frontend/src/services/keplrCompatible.ts](../frontend/src/services/keplrCompatible.ts), [frontend/src/services/wallet.ts](../frontend/src/services/wallet.ts), [frontend/src/components/common/WalletButton.tsx](../frontend/src/components/common/WalletButton.tsx).

## If connect still fails in Trust

1. Confirm the URL bar is Trust’s in-app browser, not the system browser.
2. Confirm Terra Classic is enabled in Trust and the account is a Cosmos / Terra Classic address (`terra1…`).
3. Update Trust Wallet. Older builds may inject neither `window.keplr` nor `window.trustwallet.cosmos`.
4. Desktop: install [Keplr](https://www.keplr.app/) or [Terra Station](https://station.terra.money).
