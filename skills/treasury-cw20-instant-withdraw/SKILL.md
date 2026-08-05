---
name: treasury-cw20-instant-withdraw
description: >-
  Implement, wire, or review treasury CW20 InstantWithdraw + spender registry
  + 24h per-(spender,token) pull limits (ust1-window / vFDUSD Option 3). Use when
  changing InstantWithdrawCw20, SetCw20Spender, SetCw20SpenderLimit,
  cw20_spenders / cw20_pull_limits storage, pause semantics, or mainnet migrate
  / SetCw20Spender ops for PlasticDigits2/ustr-cmm issues #6 and #7.
---

# Treasury CW20 InstantWithdraw + Spender Registry + 24h Pull Limits

Companion to GitLab issues [#6](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/6) (spender registry) and [#7](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/7) (24h pull limit). Consumer: [ust1-window#20](https://gitlab.com/PlasticDigits/ust1-window/-/work_items/20). Phase 5 withdraw smoke: [ust1-window#19](https://gitlab.com/PlasticDigits/ust1-window/-/issues/19). Audit follow-up: [audits/INTERNAL_COMPOSER_1785465508.md](../../audits/INTERNAL_COMPOSER_1785465508.md) (H-2 / M-1).

Cross-links: [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [plans/NATIVE_TOKEN_WRAPPING.md](../../plans/NATIVE_TOKEN_WRAPPING.md), [treasury-swap-removal](../treasury-swap-removal/SKILL.md) ([#8](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/8) — do not confuse wrap `NotifyDeposit` with removed swap path).

## Why this exists

Treasury cannot `IncreaseAllowance` as an EOA. Window redeem needs atomic CW20 `Transfer` from treasury inventory without the 7-day `ProposeWithdraw` timelock. Native `InstantWithdraw { denom }` is wrap-mapper-only and must stay ABI-stable.

On-chain 24h pull limits (#7) bound blast radius if a registered spender is buggy or compromised. Window-side inventory policy remains a product control; treasury limit is the hard ceiling.

## API (do not break native InstantWithdraw)

| Msg | Who | Notes |
|-----|-----|-------|
| `SetCw20Spender { token, spender, limit_24h? }` | gov | Overwrites; **no timelock**. Optional `limit_24h` sets quota in same tx |
| `RemoveCw20Spender { token }` | gov | Clears mapping + that pair's pull-limit config/usage |
| `SetCw20SpenderLimit { token, spender, limit_24h }` | gov | Sets/updates tumbling 24h max for `(token, spender)` |
| `RemoveCw20SpenderLimit { token, spender }` | gov | Fail-closed: pulls denied until limit reset |
| `SetCw20InstantWithdrawPaused { paused }` | gov | Independent of `wrapping_paused` |
| `InstantWithdrawCw20 { recipient, token, amount }` | registered spender | Emits `Cw20ExecuteMsg::Transfer`; enforces 24h quota |
| Query `Cw20Spenders {}` | anyone | Lists token→spender |
| Query `Cw20SpenderLimit { token, spender }` | anyone | limit, used, remaining, window timing |
| Query `Config {}` | anyone | Includes `cw20_instant_withdraw_paused` |

## Storage namespaces (collision-safe)

| Key | Namespace | Purpose |
|-----|-----------|---------|
| `CW20_SPENDERS` | `"cw20_spenders"` | token addr → spender |
| `CW20_PULL_LIMITS` | `"cw20_pull_limits"` | `(token, spender)` → `{ max_amount_per_window, window_seconds }` |
| `CW20_PULL_LIMIT_STATE` | `"cw20_pull_limit_state"` | `(token, spender)` → `{ amount_used, current_window_start }` |
| `CW20_INSTANT_WITHDRAW_PAUSED` | `"cw20_iw_paused"` | Item\<bool\>; absent ⇒ false |
| `DENOM_WRAPPERS` | `"denom_wrappers"` | native wrap only — do not reuse |
| `CW20_WHITELIST` | `"cw20_whitelist"` | CR / AllBalances only — not auth |

## Invariants (must hold)

1. **Auth**: `info.sender == CW20_SPENDERS[token]`; unregistered / wrong-token / gov-without-registration → fail (before quota write).
2. **Pause isolation**: `wrapping_paused` does **not** gate CW20 pulls; only `cw20_iw_paused` does.
3. **Solvency**: query CW20 balance of treasury ≥ `amount` before emitting Transfer; zero amount rejected. Solvency is checked **before** quota accounting so failed balance checks do not burn quota.
4. **24h pull limit (fail-closed)**: pulls require a configured limit for `(token, spender)`. Absent / removed limit ⇒ `Cw20PullLimitNotSet`. Tumbling window of `86400` seconds (wrap-mapper style; edge burst ~2× is documented). Exceed ⇒ `Cw20PullLimitExceeded` with **no** Transfer. Isolation: A+X does not affect A+Y or B+X.
5. **Whitelist orthogonal**: InstantWithdrawCw20 does not require whitelist membership.
6. **Timelock path unchanged**: `ProposeWithdraw` / `ExecuteWithdraw` remain for arbitrary destinations and are **not** gated by CW20 pull limits.
7. **No arbitrary WasmMsg**: only typed Transfer to validated recipient.
8. **Migrate**: additive maps; preserve governance, whitelist, pending withdrawals, denom wrappers, spenders. Pre-existing spenders cannot pull until a limit is set (fail-closed). Same migrate also strips obsolete `Config.swap_contract` ([#8](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/8) / [treasury-swap-removal](../treasury-swap-removal/SKILL.md)) — unrelated to CW20 pulls.
9. **Spender rotation**: overwriting spender A→B clears A's limit/usage for that token; B starts fresh (set limit via `limit_24h` or `SetCw20SpenderLimit`).

## Security callouts for reviewers

- Registering a buggy/malicious spender is still a gov process risk (A4/A12 of #6); the 24h limit bounds blast radius but does not remove trust. No SetCw20Spender timelock by product choice.
- Standard CW20 Transfer — no Receive hook assumed on recipient mid-treasury-state.
- Distinct storage namespaces from `denom_wrappers` / wrap-mapper `rate_limits` (A11).
- Tumbling window allows a theoretical ~2× burst at the boundary (same as wrap-mapper); size `limit_24h` with that in mind.
- `cw20_iw_paused` does **not** stop gov `ExecuteWithdraw` (A10 by design).

## Ops sequence (mainnet)

1. Store + migrate treasury in place (`terra16j5u6…`).
2. Confirm `cw20_spenders` / `cw20_spender_limit` queries + config pause fields.
3. Land window consumer (#20), then register **with limit** (fail-closed):
   `SetCw20Spender { token: TERRA_VFDUSD, spender: WINDOW_ADDR, limit_24h: "<quota>" }`
   or `SetCw20Spender` + `SetCw20SpenderLimit`. Align quota with ust1-window inventory policy (e.g. ~10_000 vFDUSD — gov-configurable).
4. Prefer coordinating migrate with wrap work [#5](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/5) when timing aligns.

## Tests to run

```bash
cd contracts && cargo test --package treasury --lib
cd contracts && cargo test --package wrap-mapper --lib   # native InstantWithdraw regression
```

Key cases: register/remove/replace spender; token isolation; CW20 pause vs wrapping pause; insufficient/zero; migrate smoke; ProposeWithdraw CW20 still works; set/remove limit; accumulate / exact remaining / exceed; window reset; fail-closed without limit; per-(spender,token) isolation.
