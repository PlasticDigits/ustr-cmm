---
name: treasury-swap-removal
description: >-
  Treasury no longer exposes SwapDeposit / SetSwapContract / Config.swap_contract
  (GitLab #8 / audit MB-1). Use when migrating treasury, reviewing swap vs wrap
  NotifyDeposit paths, or documenting USTC→USTR product flow for agents in
  PlasticDigits2/ustr-cmm.
---

# Treasury swap-path removal (#8)

Companion to GitLab issue [#8](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/8) (bundled with [#5](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/5) treasury migrate). Audit: [MB-1](../../audits/INTERNAL_COMPOSER_1785465508.md).

Cross-links: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [plans/NATIVE_TOKEN_WRAPPING.md](../../plans/NATIVE_TOKEN_WRAPPING.md), [skills/treasury-cw20-instant-withdraw](../treasury-cw20-instant-withdraw/SKILL.md).

## Why this exists

Legacy treasury `SwapDeposit` emitted a private `SwapExecuteMsg::NotifyDeposit` toward `config.swap_contract`. Live **ustc-swap** has no `NotifyDeposit` — only `Swap { referral_code, leaderboard_hint }`. Calling the old path with `swap_contract` set to ustc-swap fails atomically (dead code / footgun). Product path never used treasury `SwapDeposit`.

## Product path (live)

```
User ──Swap{USTC}──► ustc-swap ──Mint──► USTR
                         │
                         └──BankMsg::Send USTC──► Treasury (passive custody)
```

- Instantiate / configure **ustc-swap** with the treasury address; do **not** call `set_swap_contract` on treasury (removed).
- TerraClassic burn tax applies to the `BankMsg::Send` forward from swap → treasury.

## What was removed (do not reintroduce)

| Surface | Status |
|---------|--------|
| `ExecuteMsg::SwapDeposit` | Removed |
| `ExecuteMsg::SetSwapContract` | Removed |
| `Config.swap_contract` / `ConfigResponse.swap_contract` | Removed |
| Treasury-local `SwapExecuteMsg::NotifyDeposit` | Removed |
| Errors `SwapContractNotSet`, `InvalidSwapFunds`, `BelowMinimumSwap` | Removed |

## What must stay (unrelated)

| Surface | Role |
|---------|------|
| `WrapDeposit` + `WrapperExecuteMsg::NotifyDeposit` | Live wrap → wrap-mapper mint |
| wrap-mapper `NotifyDeposit` | Treasury-only wrap notify |
| `InstantWithdraw` / `InstantWithdrawCw20` | Wrap unwrap + ust1-window pulls |

## Invariants (must hold)

1. **No treasury swap ABI**: deserialize of `swap_deposit` / `set_swap_contract` fails as unknown variant after migrate.
2. **Passive custody**: treasury does not notify ustc-swap; ustc-swap does not call treasury execute for deposits.
3. **Migrate rewrite**: `migrate` loads legacy config (optional `swap_contract`, default `wrapping_paused`) and saves `Config` without `swap_contract`. Idempotent on already-new shape.
4. **Wrap isolation**: `WrapDeposit` / `DENOM_WRAPPERS` / wrap-mapper `NotifyDeposit` unchanged by this removal.
5. **CW20 InstantWithdraw isolation**: spender registry + 24h limits + `cw20_iw_paused` unchanged — see [treasury-cw20-instant-withdraw](../treasury-cw20-instant-withdraw/SKILL.md).
6. **#5 acceptance**: USTC→USTR product remains disabled operationally when swap window is ended; stronger guarantee after #8 is that treasury cannot be re-armed via `SetSwapContract`.

## Migrate / ops

1. Store new treasury wasm; migrate in place (`terra16j5u6…`) — same bump as #5/#6/#7 when bundled.
2. Query `Config {}`: no `swap_contract` field; governance / `wrapping_paused` / `cw20_instant_withdraw_paused` preserved.
3. Confirm wrap + CW20 InstantWithdraw still work; calling removed msgs fails unknown variant.
4. No mainnet action to “unset” swap — field is stripped on migrate (live was already `null`).

## Tests to run

```bash
cd contracts && cargo test --package treasury --lib
cd contracts && cargo test --package wrap-mapper --lib
```

Key cases: `test_migrate_strips_swap_contract_*`, `test_removed_swap_execute_variants_are_unknown`, `test_existing_features_after_migrate` (WrapDeposit + governance), wrap / CW20 regression suites.
