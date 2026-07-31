---
name: treasury-cw20-instant-withdraw
description: >-
  Implement, wire, or review treasury CW20 InstantWithdraw + spender registry
  (ust1-window / vFDUSD Option 3). Use when changing InstantWithdrawCw20,
  SetCw20Spender, cw20_spenders storage, pause semantics, or mainnet migrate
  / SetCw20Spender ops for PlasticDigits2/ustr-cmm issue #6.
---

# Treasury CW20 InstantWithdraw + Spender Registry

Companion to GitLab issue [#6](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/6). Consumer: [ust1-window#20](https://gitlab.com/PlasticDigits/ust1-window/-/work_items/20). Phase 5 withdraw smoke: [ust1-window#19](https://gitlab.com/PlasticDigits/ust1-window/-/issues/19).

Cross-links: [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [plans/NATIVE_TOKEN_WRAPPING.md](../../plans/NATIVE_TOKEN_WRAPPING.md).

## Why this exists

Treasury cannot `IncreaseAllowance` as an EOA. Window redeem needs atomic CW20 `Transfer` from treasury inventory without the 7-day `ProposeWithdraw` timelock. Native `InstantWithdraw { denom }` is wrap-mapper-only and must stay ABI-stable.

## API (do not break native InstantWithdraw)

| Msg | Who | Notes |
|-----|-----|-------|
| `SetCw20Spender { token, spender }` | gov | Overwrites; **no timelock** (parity with `SetDenomWrapper`) |
| `RemoveCw20Spender { token }` | gov | Clears mapping |
| `SetCw20InstantWithdrawPaused { paused }` | gov | Independent of `wrapping_paused` |
| `InstantWithdrawCw20 { recipient, token, amount }` | registered spender | Emits `Cw20ExecuteMsg::Transfer` |
| Query `Cw20Spenders {}` | anyone | Lists token→spender |
| Query `Config {}` | anyone | Includes `cw20_instant_withdraw_paused` |

## Storage namespaces (collision-safe)

| Key | Namespace | Purpose |
|-----|-----------|---------|
| `CW20_SPENDERS` | `"cw20_spenders"` | token addr → spender |
| `CW20_INSTANT_WITHDRAW_PAUSED` | `"cw20_iw_paused"` | Item\<bool\>; absent ⇒ false |
| `DENOM_WRAPPERS` | `"denom_wrappers"` | native wrap only — do not reuse |
| `CW20_WHITELIST` | `"cw20_whitelist"` | CR / AllBalances only — not auth |

## Invariants (must hold)

1. **Auth**: `info.sender == CW20_SPENDERS[token]`; unregistered / wrong-token / gov-without-registration → fail.
2. **Pause isolation**: `wrapping_paused` does **not** gate CW20 pulls; only `cw20_iw_paused` does.
3. **Solvency**: query CW20 balance of treasury ≥ `amount` before emitting Transfer; zero amount rejected.
4. **No pull cap (v1)**: registered spender may drain full token balance; document window-side limits as the product control.
5. **Whitelist orthogonal**: InstantWithdrawCw20 does not require whitelist membership.
6. **Timelock path unchanged**: `ProposeWithdraw` / `ExecuteWithdraw` remain for arbitrary destinations.
7. **No arbitrary WasmMsg**: only typed Transfer to validated recipient.
8. **Migrate**: additive maps; preserve governance, whitelist, pending withdrawals, denom wrappers.

## Security callouts for reviewers

- Registering a buggy/malicious spender can drain that token (A4/A12). Gov process only; no SetCw20Spender timelock by product choice.
- Standard CW20 Transfer — no Receive hook assumed on recipient mid-treasury-state.
- Distinct storage namespace from `denom_wrappers` (A11).

## Ops sequence (mainnet)

1. Store + migrate treasury in place (`terra16j5u6…`).
2. Confirm `cw20_spenders` query + config pause fields.
3. Land window consumer (#20), then:
   `SetCw20Spender { token: TERRA_VFDUSD, spender: WINDOW_ADDR }`.
4. Prefer coordinating migrate with wrap work [#5](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/5) when timing aligns.

## Tests to run

```bash
cd contracts && cargo test --package treasury --lib
cd contracts && cargo test --package wrap-mapper --lib   # native InstantWithdraw regression
```

Key cases: register/remove/replace spender; token isolation; CW20 pause vs wrapping pause; insufficient/zero; migrate smoke; ProposeWithdraw CW20 still works.
