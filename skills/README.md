# Agent skills (ustr-cmm)

Project skills for third-party / Cursor agents working in this repo.

| Skill | When to use |
|-------|-------------|
| [treasury-cw20-instant-withdraw](./treasury-cw20-instant-withdraw/SKILL.md) | CW20 InstantWithdraw, spender registry, 24h per-(spender,token) pull limits, pause semantics, migrate / `SetCw20Spender` ops ([#6](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/6), [#7](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/7)) |
| [treasury-swap-removal](./treasury-swap-removal/SKILL.md) | Removed treasury `SwapDeposit` / `SetSwapContract` / `swap_contract`; live path is ustc-swap `Swap` → BankMsg to treasury; migrate strips legacy config ([#8](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/8), bundled with [#5](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/5)) |
| [wrap-mapper-asymmetric-fees](./wrap-mapper-asymmetric-fees/SKILL.md) | `fee_wrap_bps` / `fee_unwrap_bps` split, retune rule for burn tax, migrate + `SetFees` ops, solvency without gross-up ([#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9); DEX [#516](https://gitlab.com/PlasticDigits/cl8y-dex-terraclassic/-/work_items/516)) |
| [frontend-vfdusd-oracle](./frontend-vfdusd-oracle/SKILL.md) | Session-once ust1-oracle USD for treasury vFDUSD; never DEX/BSC; no $1 fallback ([#10](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/10)) |
| [frontend-ust1-ratios](./frontend-ust1-ratios/SKILL.md) | Live UST1 circulating + cLUNC/cUSTC supply; CR denominator is UST1 `total_supply`; incomplete-price UX ([#11](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/11)) |
| [frontend-treasury-lp-nav](./frontend-treasury-lp-nav/SKILL.md) | Allowlisted protocol LP shares as treasury assets; reserve NAV USD; wrap-leg haircut in CR ([#14](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/14)) |
| [frontend-legal-clickwrap](./frontend-legal-clickwrap/SKILL.md) | CL8Y Legal TermsGate for connected Terra Classic wallets on `ust1cmm.com`; SDK-only; fail-closed ([#12](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/12)) |
| [frontend-keplr-compatible-wallets](./frontend-keplr-compatible-wallets/SKILL.md) | Trust Wallet / Keplr-compatible injects (`window.keplr` or `window.trustwallet.cosmos`); one `WalletName.KEPLR` path ([#4](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/4)) |

Human-facing docs: [docs/CONTRACTS.md](../docs/CONTRACTS.md), [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md), [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), [docs/WALLETS.md](../docs/WALLETS.md).
