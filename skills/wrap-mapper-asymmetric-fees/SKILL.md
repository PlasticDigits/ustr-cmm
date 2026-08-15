---
name: wrap-mapper-asymmetric-fees
description: >-
  Wrap-mapper fee_wrap_bps / fee_unwrap_bps split (GitLab #9): wrap stays ~2%,
  unwrap tuned for ≈2% user all-in under burn tax without InstantWithdraw
  gross-up. Use when migrating wrap-mapper, retuning fees after tax changes,
  reviewing solvency vs fee floors, or coordinating DEX Config consumers.
---

# Wrap-mapper asymmetric fees (#9)

Companion to GitLab issue [#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9). DEX consumer: [cl8y-dex #516](https://gitlab.com/PlasticDigits/cl8y-dex-terraclassic/-/work_items/516).

Cross-links: [docs/DEPLOYMENT.md § asymmetric fees](../../docs/DEPLOYMENT.md#asymmetric-wrapunwrap-fees-vs-burn-tax), [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [plans/NATIVE_TOKEN_WRAPPING.md](../../plans/NATIVE_TOKEN_WRAPPING.md), audits M-4/MB-2 notes in [`INTERNAL_KIMIK3_1785894984.md`](../../audits/INTERNAL_KIMIK3_1785894984.md).

## Why this exists

A single `fee_bps=200` on wrap **and** unwrap plus 1.5% burn tax made unwrap all-in ≈ **3.47%** while product marketed ~2%. Approved fix: **asymmetric fees**, keep tax on the user, **no** treasury InstantWithdraw gross-up.

| Setting | Wrap user cost | Unwrap user all-in (1.5% tax) |
|---------|----------------|------------------------------|
| Legacy `fee_bps=200` | 2% | ~3.47% |
| Target `wrap=200`, `unwrap=51` | 2% | ≈2.00% |

## ABI (breaking Config / execute)

| Surface | Status |
|---------|--------|
| `Config.fee_bps` / `ConfigResponse.fee_bps` / `SetFeeBps` | **Removed** |
| `fee_wrap_bps`, `fee_unwrap_bps` | Required |
| `SetFeeWrapBps` / `SetFeeUnwrapBps` / `SetFees` | Governance-only |
| cw2 version | `0.3.0` (wrap-mapper package) |

Prefer coordinated DEX release before declaring production done. No dual-read `fee_bps` window.

## Invariants (must hold)

1. **Path isolation:** wrap/`NotifyDeposit` charges only `fee_wrap_bps`; unwrap charges only `fee_unwrap_bps`.
2. **No gross-up:** treasury `InstantWithdraw` still sends post-fee amount; receiver pays burn tax. Do not add tax-oracle gross-up for this issue.
3. **Solvency:** unwrap burns `A` CW20 and withdraws `A − fee_unwrap`. User-paid tax does **not** erode `native ≥ supply`; surplus Δ ≈ `+fee_unwrap`. Therefore **do not** enforce `fee_unwrap ≥ burn_tax`.
4. **Bounds:** `MIN_FEE_BPS=1` … `MAX_FEE_BPS=1000` for each fee; zero rejected. `MIN_FEE_BPS` is **not** a tax-coverage floor.
5. **Migrate:** legacy `{fee_bps}` → both fields equal; idempotent on new shape. Operators must gov-set **200/51** in the same window after migrate from 200/200.
6. **Pause / rate-limit / mapping** behavior unchanged by the fee split.
7. **Governance only** for fee changes (`terra1xsecn…`); agents must not broadcast mainnet gov txs.

## Retune rule

When chain `burn_tax_rate` changes, recompute:

```text
fee_unwrap_bps = round(10000 - 9800 / (1 - burn_tax_rate))
```

Aim: `receive/A = 0.98`. Example: `0.015` → **51**. Prefer ≤ 2% all-in when rounding is ambiguous. If tax > ~2%, escalate to product (gross-up or higher all-in target).

## Ops (no secrets; human operators broadcast)

Mainnet wrap-mapper: `terra1xuuuhpmyd5t29ry7mydg7ra2q2phrwhx7j28nx7x9sjw6zznkumsz0nmd2`.

1. Store wasm → migrate `{}` → query Config (expect both fees = legacy `fee_bps` if first migrate).
2. Same window:

```bash
terrad tx wasm execute $WRAP_MAPPER \
  '{"set_fees":{"fee_wrap_bps":200,"fee_unwrap_bps":51}}' \
  --from cl8y2_admin --chain-id columbus-5 --node $RPC \
  --gas auto --gas-adjustment 1.4 --gas-prices 28.325uluna -y
```

Full runbook: [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md#asymmetric-wrapunwrap-fees-vs-burn-tax).

## Tests to run

```bash
cd contracts && cargo test --package wrap-mapper --lib
```

Key cases: `test_wrap_uses_only_fee_wrap_bps`, `test_unwrap_uses_only_fee_unwrap_bps`, `test_migrate_legacy_fee_bps_to_asymmetric`, `test_migrate_idempotent_new_shape`, `test_solvency_surplus_with_unwrap_fee_below_tax`, `test_set_fees_bounds`, dust + pause asymmetric tests.

## What must not be reintroduced

- Single `fee_bps` driving both paths
- “Unwrap fee must cover tax” comments / `MIN_FEE_BPS ≥ tax` as solvency fix under no-gross-up policy
- InstantWithdraw amount gross-up for burn tax in this issue’s scope
