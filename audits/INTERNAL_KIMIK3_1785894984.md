# Internal Security Audit — Full Codebase (KIMI K3)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-05 |
| **Epoch** | `1785894984` |
| **Auditor** | Kimi K3 (lead) + five Composer 2.5 subagents (treasury; swap/referral/airdrop; wrap-mapper/cw20-mintable; frontend/ops; test coverage) |
| **Repo revision** | `master` @ `5ecee9d` (includes MR !8 / #8 — treasury `SwapDeposit` removal + `migrate_config`) |
| **Method** | `glab` CLI for issues/MRs (not MCP); full manual review of all contract sources; `cargo test --workspace` → **421 passed, 0 failed**; fresh `cargo tarpaulin` → **96.55% line coverage (2017/2089)**; secrets scan of git history; `npm audit`; schema cross-checks frontend↔contract |
| **Prior audits** | [`INTERNAL_COMPOSER_1785465508.md`](./INTERNAL_COMPOSER_1785465508.md) (MR !5 / #6), [`INTERNAL_COMPOSER_1785466856.md`](./INTERNAL_COMPOSER_1785466856.md) (MR !6 / #7). This is a **whole-codebase** audit, not MR-scoped; it reconciles and supersedes their open items. |
| **Requested scope** | Test coverage, common DeFi attacks, common smart-contract attacks, database leaks, e2e testing, happy/bad-path testing, missing security features, access control, privileges, database, Rust server code, smart-contract design, tokenomic/economic attacks, oracle manipulation — **plus self-identified additional areas** (§2). |

---

## 1. Executive verdict

**No Critical and no unprivileged High exploit was found in contract logic.** The on-chain codebase is mature: fail-closed CW20 pull limits, solvency-before-quota ordering, atomic wrap/unwrap, timelocked governance/withdrawals, pause isolation, and 96.55% line coverage with strong bad-path testing on the newest code (treasury pull limits, wrap-mapper).

**The real risk concentration is operational and economic, not cryptographic:**

1. **Deployment tooling is broken and dangerous** (H-3): `deploy.sh`/`instantiate.json` would produce a failed or mis-configured deployment (wrong USTR decimals `6` vs required `18`, missing `referral` contract/field, silently-ignored `initial_minters`, `cap: null` in docs). Anyone redeploying from repo docs **will** misdeploy.
2. **Single-key governance can bypass every timelock that matters** (H-1, H-2): `SetDenomWrapper` / `SetCw20Spender` / limit changes execute instantly, and the native `InstantWithdraw` path lets a registered wrapper pull the **entire commingled native balance** (swap USTC + wrap backing) with no on-chain cap. Combined with EOA governance and EOA wasm-admin (per deploy script), one key compromise = full treasury drain within one block.
3. **Tokenomic leaks by design** (E-1, E-2): self-referral is unrestricted (rational actors capture the full 20% bonus; ~10% extra inflation per referred swap with zero new-user growth), and the 5%-of-supply mint safety limit is **per-transaction**, not aggregate — total swap inflation is unbounded except by USTC inflow.
4. **Zero-supply liveness trap** (H-5): if USTR `total_supply == 0` when the swap opens, **every swap reverts** (`5% × 0 = 0`). Pre-mint (airdrop/preregister) is a hard, undocumented launch dependency.

**Conditional sign-off:** bytecode on `master` is sound for the reviewed paths; **do not** execute mainnet migrate/`SetCw20Spender`/redeploys until P0 items in §10 are done (deploy tooling fixed, governance multisig, minter cap set, pre-mint verified).

### Severity summary (consolidated, deduplicated)

| Severity | Count | Headline |
|----------|-------|----------|
| Critical | 0 | — |
| High | 5 | Commingled native drain; instant gov actions; broken deploy tooling; unvalidated swap params; zero-supply swap DoS |
| Medium | 17 | Self-referral leak; uncapped minter surface; fee-floor vs burn tax; mapping-change stranding; dual-outflow races; pause gaps; frontend referral deception; no CI; npm criticals; … |
| Low | 18 | Tumbling-window bursts; overflow test gaps; float parsing; stale caches; … |
| Info | 14 | Positive confirmations + hardening notes |

---

## 2. Extended threat-surface inventory (areas identified before deep review)

The user's list was extended with the following self-identified surfaces. **Bold** = produced findings.

| # | Surface | Location | Status |
|---|---------|----------|--------|
| 1 | Treasury custody: timelocks, withdrawals, whitelists | `contracts/contracts/treasury/` | **Audited — findings** |
| 2 | Native wrap path + commingled balances | treasury ↔ wrap-mapper | **Audited — H-1** |
| 3 | CW20 InstantWithdraw + spender registry + 24h pull limits | treasury | **Audited — sound; T-notes** |
| 4 | Swap rate-decay math + boundary behavior | `ustc-swap` | **Audited — sound; H-4** |
| 5 | Mint safety limit (5%/tx) + aggregate inflation | `ustc-swap` | **Audited — E-2, H-5** |
| 6 | Referral registry, leaderboard linked list, hints, squatting | `referral`, `ustc-swap` | **Audited — E-1, L-notes** |
| 7 | Airdrop batch `TransferFrom` (public utility) | `airdrop` | **Audited — M-notes** |
| 8 | USTR mint authority: primary + additional minters, cap semantics | `external/cw20-mintable` | **Audited — E-3, C-1** |
| 9 | Migrate/upgrade paths: cw2 guards, `ConfigLegacy`, chain-admin custody | all contracts | **Audited — L-notes** |
| 10 | **Deploy scripts & instantiate params** | `contracts/scripts/`, `docs/DEPLOYMENT.md` | **Audited — H-3** |
| 11 | Frontend wallet & TX construction (cosmes null-stripping, chain-id) | `frontend/src/services` | **Audited — sound; notes** |
| 12 | **Frontend display oracles** (Binance, CryptoCompare, DEX sims, LCD fallbacks) | `frontend/src/services/price.ts` | **Audited — §7** |
| 13 | Secrets & git hygiene | repo-wide + history | **Audited — clean** |
| 14 | **CI/CD & pre-commit** | repo root, `.husky/` | **Absent — M-15** |
| 15 | Supply chain: npm deps, git submodules, cosmes library | `package.json`, `.gitmodules` | **Audited — M-14** |
| 16 | Ops runbooks (`skills/`) consistency vs code | `skills/` | **Audited — consistent** |
| 17 | **TerraClassic burn-tax interaction** (wrap fees, stats drift) | wrap-mapper, ustc-swap | **Audited — M-4, I-note** |
| 18 | Tokenomics: self-referral, bonus inflation, rate curve | swap + referral | **Audited — §6** |
| 19 | Planned future systems (DEX, perps, money market, gamefi) | `plans/` | **Out of scope — flagged: all are oracle-bearing; require separate audits before launch** |
| 20 | External preregister submodules (BSC/Terra) | `external/cmm-ustc-preregister/` | **Out of scope — vendored, not deployed by this repo** |
| 21 | **Database / Rust server** | — | **Confirmed absent — §8** |
| 22 | Test infrastructure: fuzz, multi-contract e2e, LocalTerra | — | **Absent — §3** |
| 23 | Chain-level risks: validator set, tax-module param changes, gas | columbus-5 | **Assessed — §6.5** |
| 24 | Frontend web security (CSP, XSS, localStorage, logging) | `frontend/` | **Audited — M/L-notes** |

---

## 3. Test coverage, e2e, happy/bad-path assessment

### 3.1 Measured coverage

| Crate | Tests | Result | Notes |
|-------|-------|--------|-------|
| treasury | 140 | ✅ pass | Extensive pull-limit suite (`contract.rs:5589-6146`), migrate legacy-config tests |
| wrap-mapper | 100 | ✅ pass | ~27 `cw-multi-test` integration scenarios (treasury+cw20+mapper) |
| ustc-swap | 84 | ✅ pass | Mock-querier based; **no migrate tests** |
| cw20-mintable | 54 | ✅ pass | cw20-base parity + multi-minter |
| airdrop | 31 | ✅ pass | Incl. 5 integration tests (mock cw20) |
| referral | 12 | ✅ pass | Thinnest suite |
| common | 0 | — | 0/15 lines covered (thin types) |
| **Total** | **421** | ✅ | **tarpaulin: 96.55% lines (fresh run, 2026-08-05)** |

Stale artifact note: `contracts/tarpaulin-report.html` is dated 2026-01-21 and does not reflect current code — regenerate or delete.

### 3.2 Happy/bad-path matrix (summary)

Bad-path legend: UA unauthorized · ZI zero/insufficient · WD wrong denom · P paused · TE expired · BS before-start · OV overflow · DR duplicate/replay · MW migrate.

| Contract | Happy | UA | ZI | WD | P | TE | BS | OV | DR | MW |
|----------|-------|----|----|----|---|----|----|----|----|----|
| treasury (18 exec msgs) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ⚠️ pull-limit overflow untested | ✅ | ✅ (legacy strip) |
| ustc-swap | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ only `end+1`, not exact `end_time` | ✅ | ✅ | n/a | ❌ **none** |
| wrap-mapper | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (2× burst) | n/a | ✅ | ✅ | ✅ |
| referral | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | ✅ | n/a (no migrate) |
| airdrop | ✅ | n/a (permissionless) | ✅ | ✅ | n/a | n/a | n/a | ✅ | ✅ | n/a |
| cw20-mintable | ✅ | ✅ | ✅ | n/a | n/a | ✅ | n/a | ✅ | ✅ | ✅ |

### 3.3 Top untested / weakly tested high-risk paths (ranked)

1. **ustc-swap `migrate`** — zero tests; uncovered by tarpaulin (`ustc-swap/src/contract.rs:147-164`).
2. **Swap at exact `end_time`** — boundary `>=` untested (`contract.rs:215-216`).
3. **Full swap→referral→treasury→cw20 mint chain** — no multi-contract e2e; referral is a mock querier.
4. **Airdrop insufficient-allowance failure** — mock cw20 never rejects `TransferFrom`.
5. **Referral invalid-code via `Receive`** (pre-burn path) — execute path untested.
6. **Treasury `Cw20PullLimitOverflow`** — `checked_add` overflow branch untested (`contract.rs:782-785`).
7. **Swap decimal-adjustment overflow error path** (`contract.rs:251-255`).
8. **wrap-mapper `verify_minter_access` extended-minters path** (>30 minters pagination, `contract.rs:324-336`).
9. **Treasury migrate idempotent fast-path** (re-migrate on current shape).
10. **Pull-limit sub-second window edge** (`elapsed == 86399`).

### 3.4 Test infrastructure gaps

| Gap | Impact |
|-----|--------|
| **No CI anywhere** (no `.gitlab-ci.yml`, no `.github/workflows`) | Tests/coverage never enforced; regressions merge silently |
| **No multi-contract system e2e** (swap+referral+treasury+token) | Cross-contract wiring validated only by mocks |
| **No LocalTerra/testnet e2e, no fuzz/property tests** | Deployment-shape and arithmetic-edge risks remain |
| **No frontend tests at all** (no vitest/jest/playwright/cypress; 0 spec files) | TX-construction and decimal-parsing regressions undetected |
| Pre-commit = frontend type-check + lint only | No secrets scan, no `cargo test` on contract changes |

---

## 4. Consolidated findings

IDs are global to this report; per-domain agent IDs in parentheses. Locations use `file:line`.

### HIGH

---

#### H-1 — Commingled native `InstantWithdraw`: registered wrapper can drain full native balance, uncapped, no timelock (T-1)

`treasury/src/contract.rs:664-724`

`InstantWithdraw` authenticates only `DENOM_WRAPPERS[denom] == info.sender` and bank solvency. Treasury intentionally treats all native holdings of a denom as fungible (swap forwards, wrap backing, direct transfers — documented at `contract.rs:664-674`). There is **no rate limit on the native path in treasury**; the only throttle is wrap-mapper's per-denom rate limit, which **fails open when unset** (`wrap-mapper/src/contract.rs:552-555`).

**Scenario:** compromised wrap-mapper governance key (or malicious wrapper registration) → drain the entire treasury `uusd` balance — including USTC swap proceeds unrelated to wrapped supply — in one tx, bypassing the 7-day `ProposeWithdraw` timelock and the CW20 24h pull limits.

**Fix:** cap native instant outflows per wrapper on-chain (mirror the CW20 pull-limit design); make wrap-mapper rate limits fail-closed; segregate swap-proceeds custody from wrap backing; document CR/solvency monitoring for commingled `uusd`.

---

#### H-2 — Governance instant privileged actions bypass the 7-day timelock (T-2)

`treasury/src/contract.rs:561-585, 806-849, 875-902, 604-620, 930-945`; `wrap-mapper/src/contract.rs:254-291, 363-397, 493-521`

`SetDenomWrapper`, `SetCw20Spender` (overwrite in one tx), `SetCw20SpenderLimit`, `SetFeeBps`, pause toggles, and wrap-mapper `SetDenomMapping`/`SetRateLimit` all take effect **immediately**. Governance transfer and withdrawals are timelocked; the keys to the instant paths are not.

**Scenario:** compromised Phase-1 EOA governance registers attacker wrapper/spender with a high limit and drains via instant paths before the community can react. No on-chain detection window exists.

**Fix:** multisig (≥3-of-5) governance immediately; optionally add a timelock queue for spender/wrapper/limit changes mirroring `PendingGovernance`.

---

#### H-3 — Deployment tooling cannot produce a working deployment and would misconfigure the token (S-10, O-2, O-3, O-4)

`contracts/scripts/deploy.sh:198, 209-215`; `contracts/scripts/instantiate.json:8, 22-29`; `docs/DEPLOYMENT.md:99-103, 201-209`

1. `deploy.sh` instantiates USTR with `"decimals": 6` — the swap contract **requires 18** and validates on-chain at instantiate (`ustc-swap/src/contract.rs:95-99`); referral fee math assumes 18 (`referral/src/state.rs:20`).
2. `deploy.sh` passes `"initial_minters": [...]` — a field that **does not exist** in `cw20-mintable`'s `InstantiateMsg` (`external/cw20-mintable/src/msg.rs:104-111`); serde silently ignores it → token has **no minter at all**, and the later `add_minter` step then fails (only the primary minter can add).
3. `USTC_SWAP_INIT` omits the **required** `referral` field and the script never stores/instantiates the referral contract; wrap-mapper is absent entirely.
4. `docs/DEPLOYMENT.md` shows `"cap": null` for the token minter — uncapped mint authority.
5. All contracts get `--admin "$WALLET"` and `governance = $WALLET` — single EOA is deployer, wasm-admin, governance, and primary minter.

**Scenario:** anyone redeploying (testnet, fork, or mainnet refresh) from repo docs hits failing instantiate at best; at worst they "fix" it ad hoc and ship a 6-decimal token with an uncapped EOA minter.

**Fix (P0):** rewrite deploy.sh + instantiate.json to match current schemas (decimals 18, `mint: {minter, cap}`, referral deploy + wiring, wrap-mapper deploy); add post-deploy smoke tests that execute a tiny swap end-to-end; move admin/governance to multisig in the runbook.

---

#### H-4 — Swap instantiate performs no validation of rate parameters or duration (S-1)

`ustc-swap/src/contract.rs:106-116`

`start_rate`, `end_rate`, and `duration_seconds` are accepted unchecked. `start_rate = 0` → division by zero in `execute_swap` (`contract.rs:249`); `end_rate < start_rate` → rate *improves* over time, inverting the intended tokenomics; `duration_seconds = 0` → division by zero in `calculate_current_rate` on the **query** path (`contract.rs:599-607`).

**Fix:** `start_rate > 0`, `end_rate > start_rate`, `duration > 0` validation at instantiate; add tests.

---

#### H-5 — Zero-supply liveness trap: all swaps revert if USTR supply is 0 at launch (S-2)

`ustc-swap/src/contract.rs:294-309`

`max_safe_mint = total_supply × 5%`. If the swap opens before any USTR exists (airdrop/preregister not yet executed), every swap fails `MintExceedsSafetyLimit`. This is a hard launch-order dependency that is undocumented in deploy tooling (which is itself broken — H-3).

**Fix:** document mandatory pre-mint in the runbook and assert `total_supply > 0` in a pre-launch checklist; or add a floor: `max(total_supply × 5%, FLOOR)`.

---

### MEDIUM

#### Economic / tokenomic

- **M-1 — Self-referral leak (E-1, S-4).** `ustc-swap/src/contract.rs:257-289`. No `referrer != info.sender` check. Registration costs 10 USTR once; the referrer bonus is +10% of every swap forever. Break-even is a single ~100-USTR swap, so every rational swapper self-refers: the protocol pays the full 20% bonus inflation while acquiring zero new users. *Fix:* reject self-referral, or accept and reprice the bonus (e.g. 5%+5%).
- **M-2 — Per-tx mint cap does not bound aggregate inflation (E-2, S-5).** Each swap may mint up to 5% of *current* supply; the ceiling grows with supply. Over the 100-day window total minting is bounded only by USTC inflow and the (currently uncapped, per H-3) token cap. *Fix:* global `max_total_minted` in swap config; set a hard cap on the cw20 minter entry.
- **M-3 — Uncapped additional minters + surviving renounce (E-3, C-1, C-5).** `cw20-mintable` `AddMinter` grants minting with **no per-minter cap** (only the global `total_supply ≤ cap`, if set); `UpdateMinter(None)` renounces the primary minter but **additional minters keep minting** (`contract.rs:386-422, 597-650`; confirmed by `test_remove_primary_minter_additional_still_mints`). *Fix:* clear `MINTERS` on renounce or add explicit `renounce_all_minters`; cap additional minters; document.
- **M-4 — `MIN_FEE_BPS = 1` permits fee below the 0.5% TerraClassic burn tax (W-1).** `wrap-mapper/src/state.rs` (historical single `fee_bps`). The code comment stated the fee must cover the chain tax on unwrap `BankMsg::Send`, but the enforced floor didn't. Under a **gross-up / fee-covers-tax** model, `fee_bps < tax` would erode native backing. **Superseded by [#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9):** asymmetric `fee_wrap_bps` / `fee_unwrap_bps`, **no** InstantWithdraw gross-up; tax incidence stays on the unwrap receiver; solvency surplus Δ ≈ `+fee_unwrap` so unwrap fee **may** be below tax (target `51` under 1.5% tax). Do **not** reintroduce “unwrap fee ≥ tax” as a code floor. See [`skills/wrap-mapper-asymmetric-fees`](../skills/wrap-mapper-asymmetric-fees/SKILL.md).
- **M-5 — Stats/accounting drift from burn tax (I→M borderline).** Swap records `total_ustc_received` as the **gross** amount while treasury receives net-of-tax; USTR is minted on gross — the protocol subsidizes the tax gap. Reconciliation dashboards reading `Stats` will overstate treasury holdings. *Fix:* document, or track net via treasury balance queries.

#### Contract design / access control

- **M-6 — Dual outflow paths race the same inventory (T-3).** `ExecuteWithdraw` (7-day) has no reservation; instant paths can drain the asset first, leaving a permanently failing pending withdrawal. *Fix:* soft-reserve on propose, or block instant outflows for assets with pending withdrawals.
- **M-7 — `cw20_iw_paused` does not gate timelocked CW20 `ExecuteWithdraw` (T-4).** Incident responders may believe CW20 outflows are halted while a pre-existing timelocked withdrawal remains executable. *Fix:* document loudly; consider a global outflow pause.
- **M-8 — No on-chain validation of registered wrapper/spender contract type (T-5).** Registries accept any address (`addr_validate` only); no code-ID or interface check. *Fix:* store expected code IDs; verify via `query_wasm_contract_info`; require `TokenInfo` query success for CW20 spenders.
- **M-9 — Denom-mapping change strands existing CW20 holders (W-2).** `SetDenomMapping` removes the old reverse mapping; old wrapped tokens can never unwrap. Tested behavior (`test_mapping_change_strands_old_cw20_holders`) but operationally dangerous. *Fix:* timelock + migration playbook; dual mappings during transition.
- **M-10 — Swap trusts an unverified `referral` address at instantiate (S-3).** A wrong/malicious referral contract redirects all referrer-bonus mints. *Fix:* verify code ID at instantiate; smoke-test `ValidateCode` post-deploy.
- **M-11 — Admin `RecoverAsset` is an unrestricted post-end sweep (S-7).** Any asset, any recipient, after `end_time`. Intended for stuck funds; functionally a backdoor if the admin key leaks. *Fix:* multisig admin; consider asset allowlist + timelock.
- **M-12 — Airdrop is a public batch-`TransferFrom` utility: phishing surface + unbounded batch (A-1, A-3).** No admin check (the stored `admin` is dead config — A-4). A malicious UI can trick a user into "airdroping" their own approved tokens to attacker recipients; `recipients` has no length cap → gas griefing. *Fix:* `MAX_RECIPIENTS`; off-chain recipient verification; consider merkle-claim design if public claims are ever needed; remove or use `admin`.

#### Frontend / ops

- **M-13 — Referral bonus UI deception + client-side simulation fallback (F-3).** `frontend/src/services/contract.ts:456-480`, `SwapCard.tsx:274-281`. On LCD failure the UI simulates with a fixed 1.5 rate and shows "+10% referral bonus" for **any** code string without on-chain validation; the tx then reverts on-chain (`ReferralCodeNotRegistered`) after the user signs — gas lost, trust damaged. *Fix:* gate bonus UI on `referral_valid`; remove the fallback for referral paths.
- **M-14 — Dependency vulnerabilities: 29 npm advisories incl. 1 critical (F-17).** `protobufjs` critical via **unused** `@terra-money/terra.js`; highs in `axios`, `elliptic`/`@cosmjs/*`, `react-router` open redirect. *Fix:* remove unused terra.js, `npm audit fix`, upgrade react-router; add audit to CI.
- **M-15 — No CI/CD and no frontend tests (O-7, O-11).** See §3.4.
- **M-16 — `VITE_DEV_MODE` build-time bypass (F-2).** `useLaunchStatus.ts:16` — a prod build with `VITE_DEV_MODE=true` shows a live swap UI pre-launch with mocked data. *Fix:* build-time assertion; strip dev paths from prod bundles.
- **M-17 — Display rate/launch gate driven by hardcoded constants, not on-chain config (F-6).** `useTickingRate.ts:17-64` uses `LAUNCH_DATE`/`SWAP_CONFIG` constants; if on-chain values differ, users see a wrong ticking rate while signing the correct on-chain rate. *Fix:* drive display from `CurrentRate`/`Config` queries; use ticking only as interpolation.

### LOW (abridged)

| ID | Finding | Location |
|----|---------|----------|
| L-1 | Tumbling-window ~2× burst at boundary (both treasury pull limits and wrap-mapper rate limits) — documented tradeoff; size limits accordingly | `treasury/contract.rs:774-780`; `wrap-mapper/contract.rs:541-584` |
| L-2 | `ExecuteWithdraw` CW20 path lacks balance pre-check (fails at token instead of early; atomic, no theft) | `treasury/contract.rs:432-443` |
| L-3 | `Cw20PullLimitOverflow` branch untested | `treasury/contract.rs:782-785` |
| L-4 | `InstantWithdraw` conflates `NoDenomWrapper`/`NotRegisteredWrapper` errors | `treasury/contract.rs:692-697` |
| L-5 | Treasury `migrate` has no version-ordering guard (downgrade possible by wasm admin); cw20-mintable uses `ensure_from_older_version` — inconsistent hardening | `treasury/contract.rs:72-90` |
| L-6 | Pending governance proposals never expire; stale proposals remain acceptable indefinitely | `treasury/contract.rs:197-224` |
| L-7 | `migrate_config` fast path reports `stripped_swap_contract=false` even when serde stripped a legacy field (cosmetic telemetry only) | `treasury/contract.rs:97-104` |
| L-8 | `verify_minter_access` paginates only 30 additional minters → operational DoS if wrap-mapper is beyond first 30 | `wrap-mapper/contract.rs:324-336` |
| L-9 | Fee rounds to zero below 200 units @50bps — dust fee-avoidance, negligible | `wrap-mapper/contract.rs:524-530` |
| L-10 | Independent pause flags (wrap-mapper vs treasury `wrapping_paused`) can desync operators | both contracts |
| L-11 | Zero-amount cw20 `Transfer`/`Send`/`Mint` allowed (check removed vs cw20-base) — event spam only | `cw20-mintable/contract.rs:241-268` |
| L-12 | `SwapSimulation` query uses `unwrap_or(zero)` on bonus overflow vs execute's `multiply_ratio` — divergent edge behavior | `ustc-swap/contract.rs:1234-1238` |
| L-13 | Referral code squatting race (first-wins, case-insensitive) — economic, bounded by 10 USTR/code, 10 codes/owner | `referral/contract.rs:84-104` |
| L-14 | Malformed `RegisterCodeMsg` JSON → generic parse error (atomic, funds safe) | `referral/contract.rs:78` |
| L-15 | `Math.floor(parseFloat(x) * 1e6)` micro-unit conversion — float precision on extreme inputs; use BigInt string parsing | `useSwap.ts:59-60, 79` |
| L-16 | Stale LCD cache served up to 60s on full endpoint failure; no staleness banner | `contract.ts:272-276` |
| L-17 | Verbose `console.log` of TX details in prod build | `contract.ts:1267-1286` |
| L-18 | No CSP / `X-Frame-Options` / HSTS headers; Google Fonts CDN supply-chain; `deployment-*.json` not gitignored | `index.html`, `_redirects`, `.gitignore` |

### INFO / positive confirmations

- **Unwrap atomicity correct:** burn + `InstantWithdraw` are sibling submessages; any failure rolls back both (integration-tested). No reentrancy surface: treasury `InstantWithdrawCw20` uses `Transfer` (no hook); wrap-mapper `Receive` only schedules messages.
- **`NotifyDeposit` cannot be spoofed:** wrap-mapper accepts only `config.treasury`; treasury accepts only registered wrapper for `InstantWithdraw`.
- **Pull limits fail closed** when unset/removed; solvency checked before quota burn; spender rotation clears stale limits.
- **Swap math sound:** linear decay `rate(t) = 1.5 + (2.5−1.5)·elapsed/total`; floor rounding favors protocol; boundaries correct (`t==start` allowed at 1.5; `t>=end` rejected); validator timestamp skew negligible (~1.2e-5 rate units/sec).
- **Leaderboard bounded:** top-50 linked list, O(50) worst-case with hint fallbacks; no gas-griefing vector.
- **Referral contract cannot mint** — it burns the 10 USTR registration fee; code registry only.
- **Airdrop cannot drain third parties:** `TransferFrom.owner` is always the caller; duplicate/zero/invalid recipients rejected; atomic batch.
- **No secrets in repo or git history** (`*.env*` clean; `.env.development` gitignored; only `VITE_DEV_MODE=false`).
- **Frontend TX construction correct:** msg schemas match contracts; null-field omission handled for cosmes; chain-id `columbus-5` enforced; no `dangerouslySetInnerHTML`/`eval`; `rel="noopener noreferrer"` on external links.
- **MR !8 (SwapDeposit removal) is clean:** ABI rejects removed variants; `ConfigLegacy` migration handles both legacy shapes; MB-1 footgun eliminated.
- **Submodules pinned** to commits (`cw20-mintable@73a206b5`, `cmm-ustc-preregister@4b5c7b61`).

---

## 5. Smart-contract attack checklist (results)

| Attack class | Result |
|--------------|--------|
| Reentrancy (cw20 hooks, cross-contract) | ✅ Not vulnerable — atomic CosmWasm execution; no state-write-after-call patterns; `Transfer` not `Send` on sensitive paths |
| Integer overflow/underflow | ✅ `Uint128` checked math; divide-before-multiply fix verified (`ustc-swap:244-255` + regression tests); fee subtraction bounded by `fee_bps ≤ 1000` |
| Access control bypass | ✅ All 20 treasury / 7 swap / 11 wrap-mapper execute msgs verified (matrices in §9); airdrop intentionally permissionless |
| Timelock bypass | ⚠️ Timelocks sound, but instant registry/fee/pause setters bypass them by design (H-2) |
| Front-running / MEV | ✅ Negligible — time-based rate (not AMM); TerraClassic low-MEV environment; no end-of-window advantage (rate worsens monotonically) |
| Flash-loan attacks | ✅ N/A — no pools, no on-chain oracles, no share accounting |
| First-depositor / share inflation | ✅ N/A — no vault/share math anywhere |
| Rounding exploitation | ✅ Floor rounding favors protocol on swap and fees; dust fee-avoidance negligible (L-9) |
| Denial of service | ⚠️ H-5 zero-supply swap DoS; airdrop unbounded batch gas (M-12); leaderboard bounded O(50) ✅ |
| Replay / duplicate actions | ✅ Withdrawal IDs hashed+uniquified; duplicate airdrop recipients rejected; referral codes unique |
| Malicious cw20 tokens | ✅ Registries gate all token interactions; `verify_minter_access` on mapping; unregistered tokens rejected |
| Upgrade/migrate attacks | ⚠️ cw2 name-guard only; chain-admin custody is the control (T-11); no downgrade guard on treasury (L-5) |
| Signature/serialization issues | ✅ Frontend handles cosmes null-stripping; no signature malleability surface found |
| Oracle manipulation | ✅ No on-chain oracle dependency; UI-only price display (§7) |

---

## 6. Tokenomic & economic attack analysis

### 6.1 Swap mechanics

`USTR_out = floor(USTC_in / rate(t) × 10¹²)`, `rate: 1.5 → 2.5` linear over 100 days. Early participation is strictly better — no sniping edge at the end. The 0.5% TerraClassic burn tax on the treasury forward means treasury receives less than `Stats.total_ustc_received` records (M-5).

### 6.2 Inflation vectors

| Vector | Bound |
|--------|-------|
| Swap base mint | USTC inflow × rate — unbounded by design |
| Referral bonuses | +20% of referred base (10% user + 10% referrer) |
| Per-tx safety cap | 5% of current supply — **grows with supply; not an aggregate cap** (M-2) |
| cw20-mintable cap | Global `cap` if set at instantiate — **docs show `cap: null`** (H-3) |
| Additional minters | Uncapped individually; survive primary renounce (M-3) |
| Self-referral | Unrestricted; rational for every swapper (M-1) |

**Net assessment:** USTR supply integrity currently rests on (a) swap contract logic, (b) the deployer EOA's minter key, (c) the 5%/tx heuristic. Setting a hard `cap`, removing the EOA minter post-launch, and deciding the self-referral policy are the three highest-leverage tokenomic actions.

### 6.3 Death-spiral / bank-run relevance

The system is collateralized (USTC in treasury), not algorithmic — the ECONOMICS.md analysis holds for the contracts as built: there is no redemption mechanism that mints against collateral, so no reflexive mint-dump loop exists in the *current* code. The wrap/unwrap path is 1:1 custody (fee on top), not fractional. The planned money-market/DEX/perp systems (`plans/`) would introduce exactly these reflexive/oracle surfaces — they must be audited separately before activation.

### 6.4 Treasury economics

Fees accumulate as **untracked native surplus** in treasury (wrap fee stays; unwrap burns gross CW20 but pays net native). Surplus is indistinguishable from backing on-chain — governance could mint CW20 against fee surplus via the documented direct-mint path (W-8). Solvency invariant (`CW20 supply ≤ native balance`) is enforced at withdrawal time by the bank balance check — correct, but per-denom accounting would make insolvency detectable *before* a failed unwrap.

### 6.5 Chain-level dependencies

TerraClassic burn-tax rate/cap are chain-governance parameters. Under [#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9) (no gross-up), a tax increase does **not** silently erode `native ≥ supply`; it worsens **user** unwrap all-in until governance retunes `fee_unwrap_bps` (or product accepts a higher all-in / revisits gross-up). Validator set quality affects timestamp precision (negligible here) and tx inclusion (liveness only). Recommend monitoring tax-param governance proposals and applying the DEPLOYMENT retune rule.

---

## 7. Oracle manipulation analysis

**On-chain: no oracle exists.** The swap rate is a pure function of block time; wrap/unwrap is 1:1; treasury moves assets at face value. There is nothing to manipulate on-chain in the current system.

**Frontend (display-only) oracle surface:**

| Source | Use | Manipulation impact |
|--------|-----|---------------------|
| Binance `ticker/price` (primary) | LUNC/USTC USD | Dashboard USD figures only — cannot affect swap output (contract-computed) |
| CryptoCompare (fallback) | Same | Same |
| DEX pool `simulation` via LCD (Garuda/Terraswap/Terraport) | Token USD prices | Thin pools can be manipulated to display fake USTR value; spot price of a 1M-unit sim, no TWAP, no sanity bounds |
| LCD endpoints (publicnode, binodes, hexxagon) | All chain queries | Malicious endpoint can serve stale/wrong *display* data; signed TXs still execute on-chain truth |

Gaps: no cross-source deviation check, no staleness indicator (F-10 retains last price on failure), no "indicative price" labeling. **Risk: user deception, not fund theft.** If a future feature ever lets price feeds influence TX construction, this becomes Critical — flag for the planned DEX work.

---

## 8. Database & Rust server analysis

**Neither exists in this repository.** Verified: no `sqlite/postgres/mysql/mongo/prisma` dependencies; no `actix/axum/warp/rocket` server code; the only Rust is CosmWasm contracts; `frontend/jobs/` contains markdown task specs, not a service. The architecture is chain + static frontend, so **database-leak and server-exploit classes are N/A** by construction.

Adjacent surfaces that substitute for a backend and *were* audited: LCD/RPC endpoint trust (§7), static hosting headers (L-18), localStorage contents (referral code + wallet address only — no secrets), and the `_redirects` SPA config. If a backend is introduced later (the `plans/` systems imply indexers), it needs its own audit: injection, authz, key custody, rate limiting.

---

## 9. Access control & privileges matrix (condensed)

| Contract | Privileged role | Powers | Timelock? |
|----------|----------------|--------|-----------|
| treasury | `governance` | Withdrawals (propose/execute/cancel), CW20 whitelist, **denom wrappers, CW20 spenders + limits, pauses — all instant** | Withdrawals & gov-transfer: 7d ✅; registry/pause: ❌ |
| treasury | registered wrapper (per denom) | `InstantWithdraw` up to **full bank balance** | ❌ (H-1) |
| treasury | registered spender (per token) | `InstantWithdrawCw20` up to 24h pull limit | ✅ quota |
| treasury | wasm chain-admin | `migrate` to arbitrary code | chain-level |
| ustc-swap | `admin` | pause/resume (instant), `RecoverAsset` after end (instant), admin transfer | transfer: 7d ✅ |
| wrap-mapper | `governance` | denom mappings, rate limits, fee (1–1000bps), pause — all instant | gov-transfer: 7d ✅ |
| cw20-mintable | primary minter | mint (to cap), add/remove minters, update/renounce minter | ❌ |
| cw20-mintable | additional minters | mint (uncapped individually; global cap only) | ❌ |
| referral | — | none (single permissionless `Receive`) | n/a |
| airdrop | — | none (`admin` field unused) | n/a |

**Privilege concentration:** per deploy tooling, one EOA is deployer + wasm-admin + treasury governance + swap admin + token primary minter. This is the single largest systemic risk (H-2/H-3/O-4). Multisig + separation of duties is the P0 fix.

---

## 10. Remediation roadmap

| Priority | Item | Addresses |
|----------|------|-----------|
| **P0** | Rewrite `deploy.sh`/`instantiate.json`/DEPLOYMENT.md to current schemas (18 decimals, `mint:{minter,cap}`, referral + wrap-mapper deploy & wiring); add post-deploy e2e smoke test | H-3, H-5 |
| **P0** | Move governance/admin/minter to multisig; document key ceremony; verify on-chain admin custody of existing mainnet contracts | H-1, H-2, M-11 |
| **P0** | Set hard `cap` on USTR minter; remove EOA minter after launch wiring; decide & document self-referral policy | M-1, M-2, M-3 |
| **P1** | Add swap instantiate validation (`start_rate>0`, `end_rate>start_rate`, `duration>0`) | H-4 |
| **P1** | On-chain cap for native `InstantWithdraw` per wrapper (or fail-closed wrap-mapper rate limits + documented sizing) | H-1 |
| **P1** | Timelock queue for spender/wrapper/limit/fee changes | H-2, M-9 |
| **P1** | ~~`MIN_FEE_BPS ≥ 50` (or tax-aware floor)~~ — **superseded by [#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9)** asymmetric fees + no gross-up; retune `fee_unwrap_bps` instead | M-4 |
| **P1** | CI: `cargo test` + tarpaulin + `npm audit` + gitleaks; husky runs contract tests on `contracts/**` changes | M-15 |
| **P2** | Fix referral UX (validate before showing bonus; remove client-side fallback); drive display rate from on-chain queries | M-13, M-17 |
| **P2** | Remove unused `@terra-money/terra.js`; patch npm criticals/highs | M-14 |
| **P2** | Add the 10 ranked missing tests (§3.3), incl. swap `migrate` and exact-`end_time` | §3 |
| **P2** | Multi-contract e2e (swap+referral+treasury+token) via cw-multi-test; testnet smoke runbook | §3.4 |
| **P3** | CSP/security headers; strip prod console logs; BigInt amount parsing; `deployment-*.json` gitignore; airdrop `MAX_RECIPIENTS`; stale-proposal expiry; migrate version-ordering guards | L-items |

---

## 11. Reconciliation with prior audits

| Prior item | Status now |
|------------|------------|
| MR !5/#6 H-2/M-1 (no on-chain pull cap) | ✅ Closed by MR !6 (fail-closed 24h limits) — re-verified this audit |
| MR !6 accepted risks (no timelock on spender set; ProposeWithdraw bypasses pull limits; ~2× burst) | 🔶 Still open — carried as H-2, M-6, L-1 |
| MB-1 (dead SwapDeposit footgun) | ✅ Closed by MR !8 / `b2fe58e` — removal verified clean, migrate correct |
| Prior "hold mainnet SetCw20Spender" guidance | 🔶 Unchanged — still hold until P0 multisig + companion-contract verification |

---

*End of report. Methodology note: five Composer 2.5 subagents performed domain deep-dives; all High/Medium findings were independently verified against source by the lead before inclusion. Tooling: `cargo test`, `cargo tarpaulin`, `npm audit`, `glab`, git history secrets scan.*
