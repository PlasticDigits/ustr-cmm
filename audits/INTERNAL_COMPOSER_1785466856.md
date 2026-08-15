# Internal Security Audit — MR !6 / Issue #7 (+ Broader Surfaces)

| Field | Value |
|-------|-------|
| **Date** | 2026-07-31 |
| **Epoch** | `1785466856` |
| **Auditor** | Composer 2.5 (multi-agent) + lead synthesis |
| **Focus** | [MR !6](https://gitlab.com/PlasticDigits2/ustr-cmm/-/merge_requests/6) — `feat(treasury): 24h InstantWithdrawCw20 pull limit per spender+CW20 (#7)` |
| **Issue** | [#7](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/7) (open at audit time; MR merged) |
| **Repo revision** | `master` @ `98fc4de` (MR merge); feature commit `b9cd7cc`; `cargo test --package treasury --lib` → **150 passed** |
| **Method** | `glab` for MR/issue (not MCP); code review of treasury/wrap-mapper/ustc-swap/airdrop/referral/cw20-mintable/frontend/docs/skills; four Composer 2.5 subagents (threat-surface map, treasury pull-limit path, other contracts, frontend/ops) |
| **Prior audit** | [`audits/INTERNAL_COMPOSER_1785465508.md`](./INTERNAL_COMPOSER_1785465508.md) (MR !5 / #6) — this document signs off A1–A14 from #7 and tracks H-2/M-1 closure |
| **Scope note** | Formal A1–A14 security sign-off was explicitly deferred in MR !6; this document is that sign-off attempt |

---

## Executive verdict

**On-chain 24h CW20 pull-limit logic is sound** under the product threat model. Fail-closed when unset/removed, solvency-before-quota ordering, spender auth before usage writes, tumbling-window math aligned with wrap-mapper, distinct storage namespaces, and typed `Transfer` (not `Send`) are correctly implemented. No unprivileged Critical exploit was found on the MR !6 path.

**Prior H-2 / M-1 (no on-chain pull cap) are closed for `InstantWithdrawCw20`.** Residual blast radius is now `limit_24h` per tumbling window (theoretical ~2× at the boundary). Full-balance drain on the *instant* path is no longer possible unless governance sets an effectively unlimited quota.

**Conditional sign-off:**

1. **Approve** treasury migrate of pull-limit API and mainnet readiness of the *bytecode*.
2. **Hold** mainnet `SetCw20Spender` / redeem enablement until: production `limit_24h` sized for ~2× burst, ust1-window companion audited, address dual-check, and post-wiring smoke redeem.
3. **Accept** as product risks: no timelock on spender/limit gov msgs (H-1); `ProposeWithdraw`/`ExecuteWithdraw` bypass pull limits (by design); tumbling ~2× burst (M-3).

---

## Threat-surface inventory (extra areas analyzed)

Beyond the user's initial list, the following surfaces were mapped before deep review:

| # | Surface | Path / system | Relevance |
|---|---------|---------------|-----------|
| 1 | Treasury CW20 pull limits (#7) | `treasury/src/{contract,state,msg,error}.rs` | **Direct** |
| 2 | Spender registry / pause (#6) | `CW20_SPENDERS`, `cw20_iw_paused` | **Direct** |
| 3 | Timelocked Propose/ExecuteWithdraw | `treasury` | Dual-outflow bypass |
| 4 | Native InstantWithdraw + wrap-mapper rate limits | `treasury` + `wrap-mapper` | Parallel fail-open vs fail-closed |
| 5 | USTC→USTR swap + referral mint | `ustc-swap`, `referral` | Broader inflation |
| 6 | USTR mint authority | `external/cw20-mintable/` | Broader |
| 7 | Airdrop batch TransferFrom | `airdrop` | Broader |
| 8 | Frontend wallet / LCD / prices | `frontend/src/` | Display trust |
| 9 | Ops / migrate / SetCw20Spender runbooks | `docs/DEPLOYMENT.md`, skill | **Direct** |
| 10 | CI/CD, e2e, LocalTerra | mostly absent | Gap |
| 11 | Database / Rust HTTP server | **none in repo** | N/A (no DB leak vector) |
| 12 | Companion ust1-window | out of repo | **Direct** trust boundary |
| 13 | Deploy scripts / instantiate JSON | `contracts/scripts/` | Decimals / minter footguns |
| 14 | Economic / CR / `uusd` commingling | `ECONOMICS.md`, wrap + swap | Adjacent |
| 15 | Oracle manipulation | frontend CEX/DEX only; no on-chain oracle in IW | UI only |
| 16 | Planned systems (DEX/perps/money market) | `plans/` | Future oracle/DB surface |
| 17 | BSC/Terra preregister submodules | `external/cmm-ustc-preregister/` | Broader |
| 18 | Wasm admin / migrate | treasury `migrate`, chain admin | **Direct** |

### Architecture (MR !6 trust map)

```text
User ──WrapDeposit──► Treasury ──NotifyDeposit──► WrapMapper ──Mint──► Wrapped CW20
User ──CW20 Send Unwrap──► WrapMapper ──Burn + InstantWithdraw(native)──► Treasury ──Bank──► User

ust1-window ──InstantWithdrawCw20──► Treasury
  checks: pause → zero → spender auth → CW20 balance → 24h (token,spender) quota
  then: Cw20 Transfer(vFDUSD)──► User

Gov ──SetCw20Spender{limit_24h?} / SetCw20SpenderLimit (no timelock)──► quota config
Gov ──ProposeWithdraw (7d)──► ExecuteWithdraw  [NOT gated by pull limits]
```

wrap-mapper does **not** call `InstantWithdrawCw20`. Paths remain parallel.

**Semantic contrast:** wrap-mapper rate limits are **fail-open** when unset; treasury CW20 pull limits are **fail-closed**. Intentional and safer for treasury inventory.

---

## Findings — MR !6 / Issue #7 (primary)

### Critical

None. No unprivileged path bypasses spender auth, exceeds configured quota on InstantWithdrawCw20, or drains treasury CW20 beyond governance-set limits on the instant path.

### High

| ID | Finding | Location | Notes |
|----|---------|----------|-------|
| **H-1** | **`SetCw20Spender` / `SetCw20SpenderLimit` / `RemoveCw20SpenderLimit` have no timelock** — compromised gov can instantly rotate spender, set `Uint128::MAX` quota, or fail-closed halt redeems. | `treasury/src/contract.rs:865-987`, `msg.rs:95-123` | Issue A11/A13. Product choice (parity with SetDenomWrapper / wrap-mapper SetRateLimit). Prior H-1 unchanged. |
| **H-2** | **Residual economic drain within quota + alternate unlimited outflow** — spender can pull up to `limit_24h` (~2× at boundary) to any recipient; `ProposeWithdraw`/`ExecuteWithdraw` still drain full CW20 balance after 7d and are **not** gated by pull limits. | IW: `contract.rs:1017-1081`; ExecuteWithdraw CW20: `~408-418`; `state.rs:100` | Prior H-2 **mitigated on IW path**; residual at system level. Size `limit_24h` with 2× burst. |
| **H-3** | **Migration / ops fail-closed can halt production redeems** — migrate is version-bump only; pre-existing spenders cannot pull until explicit limit set; `SetCw20Spender { limit_24h: None }` leaves path blocked. | `migrate` `79-94`; fail-closed `818-823`; `DEPLOYMENT.md:346` | Correct safety default; ops must wire limit atomically. |
| **H-4** | **Ops / companion trust boundary incomplete** — `$TERRA_VFDUSD` / `$WINDOW_ADDR` / `$VFDUSD_PULL_LIMIT_24H` placeholders lack enforced checksum/code-ID gates, dual-operator check, or post-wiring redeem smoke. ust1-window out of repo. | `docs/DEPLOYMENT.md`, skill | Wrong address = irreversible misconfig (bounded by limit if set). |

### Medium

| ID | Finding | Location | Notes |
|----|---------|----------|-------|
| **M-1** | `SetCw20SpenderLimit` does not verify `spender == CW20_SPENDERS[token]` — orphan limits possible; registered spender stays fail-closed (safe halt, ops confusion). | `contract.rs:934-961` | Issue recommended optional check |
| **M-2** | Dual CW20 outflow without shared inventory accounting — IW quota vs timelocked ExecuteWithdraw race same token. | IW + `execute_execute_withdraw` | Prior M-2 unchanged |
| **M-3** | Tumbling window boundary burst (~2× `limit_24h`) — documented in skill; wrap-mapper has `test_rate_limit_window_boundary_burst`, treasury does not. | `check_cw20_pull_limit` `833-839`; skill L65 | Issue A7 |
| **M-4** | Lowering limit mid-window does not reset `amount_used` — if used ≥ new limit, pulls freeze until window reset (gov grief A13). | `save_cw20_pull_limit` `795-806` | Fail-closed, not a bypass |
| **M-5** | Unit tests assert mock state / WasmMsg only; **no cw-multi-test / LocalTerra** balance proof for InstantWithdrawCw20 + limits. | `contract.rs:5983-6603`; Cargo.toml has unused cw-multi-test dep | Verification criterion #3 unmet |
| **M-6** | `cw20_iw_paused` does **not** stop gov `ExecuteWithdraw` — IR may wrongly assume “pause = all CW20 outflows halted”. | pause `1025-1030` vs ExecuteWithdraw | Prior M-4 |
| **M-7** | Whitelist / frontend tokenlist orthogonal — CR/`AllBalances`/treasury UI may omit tokens drained via InstantWithdrawCw20. | `state.rs`; `frontend/src/hooks/useTreasury.ts` | Monitoring gap |

### Low

| ID | Finding | Location | Notes |
|----|---------|----------|-------|
| **L-1** | No overflow unit test (`Cw20PullLimitOverflow`); code uses `checked_add` correctly. wrap-mapper has `test_rate_limit_overflow_returns_error`. | `841-844`, `error.rs:87-88` | A6 |
| **L-2** | Missing explicit tests: A2 single pull > limit, A7 boundary burst, ExecuteWithdraw bypass, mid-window limit decrease, orphan SetCw20SpenderLimit, wrapping_paused+limit combo. | test suite `5983-6603` | See matrix |
| **L-3** | No `old_spender` attribute on SetCw20Spender overwrite — harder to alert on rotation. | `880-906` | Prior L-2 |
| **L-4** | Re-set same spender with new `limit_24h` retains `amount_used` — ops may expect fresh quota. | `890-897` | Document |

### Informational (positive / by design)

| ID | Note |
|----|------|
| **I-1** | Fail-closed vs wrap-mapper fail-open — intentional; safer treasury default |
| **I-2** | Solvency before quota — failed balance checks do not burn quota (tested) |
| **I-3** | Auth before quota write — unregistered spender does not mutate usage (tested) |
| **I-4** | Storage namespaces distinct: `cw20_pull_limits`, `cw20_pull_limit_state`, `cw20_spenders`, `cw20_whitelist`, `denom_wrappers`, wrap-mapper `rate_limits` |
| **I-5** | Uses `Cw20ExecuteMsg::Transfer` (not `Send`) — low reentrancy risk; CosmWasm atomicity rolls back usage if Transfer fails |
| **I-6** | Spender rotation A→B clears A's limit+usage; remove clears pair (tested) |
| **I-7** | Zero amount / zero limit / remove-limit fail-closed correctly handled |
| **I-8** | Query applies same window-expiry logic without mutating storage |
| **I-9** | `window_seconds` hardcoded to `86400` on save — cannot set `window_seconds=0` bypass (unlike wrap-mapper M-1) |
| **I-10** | 16 dedicated pull-limit unit tests; 150 treasury lib tests green |

---

## Test coverage matrix (issue #7 T1–T17 / A1–A14)

### Functional (T1–T17)

| ID | Status | Evidence / gap |
|----|--------|----------------|
| T1 Set limit + query | **pass** | `test_cw20_pull_limit_set_and_query` |
| T2 Non-gov denied | **pass** | `test_cw20_pull_limit_set_remove_unauthorized` |
| T3 Happy pull | **partial** | Usage OK; no real CW20 balance delta |
| T4 Exact remaining | **pass** | `test_cw20_pull_limit_exact_remaining_succeeds` |
| T5 Exceed / no Transfer | **pass** | `test_cw20_pull_limit_exceeded_no_messages_usage_unchanged` (error path; no msgs) |
| T6 Per-token isolation | **pass** | `test_cw20_pull_limit_separate_quotas_per_token` |
| T7 Spender rotate | **pass** | `test_cw20_pull_limit_rotate_spender_fresh_usage` |
| T8 Window reset | **pass** | `test_cw20_pull_limit_window_reset` (not boundary burst) |
| T9 Remove fail-closed | **pass** | `test_cw20_pull_limit_remove_fails_closed` |
| T10 Pause blocks | **pass** | `test_cw20_pull_limit_pause_still_blocks` |
| T11 wrapping_paused orthogonal | **partial** | Pre-#7 test; not re-asserted with active limit |
| T12 Insufficient balance | **pass** | `test_cw20_pull_limit_insufficient_balance_under_limit` |
| T13 Zero amount | **pass** | `test_cw20_pull_limit_zero_amount_usage_unchanged` |
| T14 Unregistered | **pass** | `test_cw20_pull_limit_unregistered_no_usage` |
| T15 ProposeWithdraw / native IW | **partial** | Propose unaffected by spender registry; no ExecuteWithdraw+limit / native+limit combo |
| T16 Migrate smoke | **pass** | `test_cw20_pull_limit_migrate_smoke` |
| T17 Query remaining | **pass** | Multiple query assertions |
| Extra | **pass** | fail-closed no config; zero limit blocks all |

### Attack vectors (A1–A14)

| ID | Status | Evidence / gap |
|----|--------|----------------|
| A1 Many small pulls | **partial** | Cumulative via exact-remaining; no long sybil loop |
| A2 Single pull > limit, balance ≫ | **missing test** | Code path covered by exceed logic |
| A3 Bypass via Propose/ExecuteWithdraw | **accept risk** | By design; Propose partial coverage |
| A4 Native InstantWithdraw bypass | **N/A** | Different path |
| A5 Spoof spender / wrong token | **pass** | Auth + keyed limits |
| A6 Overflow | **code OK / test missing** | `checked_add` |
| A7 Window boundary burst | **accept risk** | Documented; test missing |
| A8 limit=0 | **pass** | `test_cw20_pull_limit_zero_limit_blocks_all_pulls` |
| A9 Same-block sequential | **code OK** | CosmWasm sequential; untested |
| A10 Storage collision | **pass** | Distinct namespaces + migrate |
| A11 Attacker spender + high limit | **accept risk** | Gov process (H-1) |
| A12 Stale unlock on re-register | **pass** | Cleared on rotate/remove |
| A13 Gov tiny limit mid-flight | **accept risk** | Fail-closed grief; untested |
| A14 Pause off + exhausted | **pass** | Exceed still blocks |

**E2E / happy+bad path outside unit mocks:** LocalTerra / rebel live smoke and ust1-window cross-repo redeem smoke remain **unchecked** (MR checklist open items).

---

## Findings — adjacent contracts & economics

### High (broader)

| ID | Finding | Location |
|----|---------|----------|
| **HB-1** | **Commingled native `uusd`** — InstantWithdraw (native) can pull full bank balance; same denom may back swap deposits + wraps. | `treasury` IW native, wrap-mapper |
| **HB-2** | **wrap-mapper trusts treasury `NotifyDeposit` amount** — no on-chain deposit proof; malicious treasury migrate ⇒ unbacked mint. | `wrap-mapper/contract.rs:132-182` |
| **HB-3** | **USTR primary minter compromise** — `UpdateMinter` / `AddMinter` without timelock; uncapped mint if `cap: None`. | `cw20-mintable` |
| **HB-4** | **wrap-mapper rate limits fail-open when unset** — diverges from treasury MR6 fail-closed; unset = unlimited wrap/unwrap until treasury native exhausted. | `wrap-mapper/contract.rs:552-555` |
| **HB-5** | **`deploy.sh` USTR decimals=6 + invalid `initial_minters` field** — swap expects 18 decimals and `mint` field; fresh deploys break. | `contracts/scripts/deploy.sh:198` |

### Medium (broader)

| ID | Finding |
|----|---------|
| **MB-1** | wrap-mapper `window_seconds=0` resets every call (accepted/tested); treasury hardcodes 86400 (safer). |
| **MB-2** | wrap-mapper `MIN_FEE_BPS=1` may under-cover Terra Classic tax → slow solvency erosion. **Superseded by [#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9):** asymmetric fees, no gross-up; tax on receiver; see [`skills/wrap-mapper-asymmetric-fees`](../skills/wrap-mapper-asymmetric-fees/SKILL.md). |
| **MB-3** | wrap-mapper minter verification `limit: 30` — false reject if mapper not in first page. |
| **MB-4** | ustc-swap admin pause / post-period `RecoverAsset` centralization; no `start_rate`/`end_rate` validation at instantiate. |
| **MB-5** | airdrop: unused `admin`; unbounded recipients (gas DoS). |
| **MB-6** | Dual/triple pause surfaces (treasury wrapping, CW20 IW, wrap-mapper) — IR complexity. |
| **MB-7** | Direct CW20 mint by governance bypasses wrap-mapper rate limits. |
| **MB-8** | referral/airdrop: no `migrate` entry point. |
| **MB-9** | Zero USTR supply blocks all swaps (5% of zero = zero). |

### Low / Info (broader)

- Treasury `Receive` accepts any CW20 (accounting via whitelist only).
- Referral: no admin (good); lacks cw-multi-test with real CW20 Send/Burn.
- `ustr-token` crate has no `src/` — production is external `cw20-mintable`.
- `packages/common` is type-only.
- No CosmWasm `Reply`/`SubMsg` callback reentrancy pattern in first-party contracts.
- Oracle manipulation N/A on-chain for swap (time-linear rate) and IW (amount-based).

---

## Findings — frontend, ops, “database”, oracles

**No application server and no database exist in this repository.** Classic “DB leak” / SQLi / server-session CSRF vectors do not apply. Persistence is CosmWasm contract state + browser `localStorage` (referral codes, wallet address).

| Sev | Finding |
|-----|---------|
| **High** | No GitLab CI / workflow running `cargo test` or frontend security gates for contract changes |
| **High** | `VITE_DEV_MODE=true` in a prod build bypasses launch gating / mocks swap status |
| **High** | Client-side swap simulation fallback (hardcoded 1.5 rate / 10% bonus) on LCD failure — deceptive quotes |
| **High** | `deploy.sh` centralizes WASM admin + treasury gov + USTR minter in one wallet |
| **Med** | Referral URL path persisted without format validation; UI claims bonus before on-chain validate |
| **Med** | LCD/RPC trust + stale cache; treasury UI uses `tokenlist.json` not on-chain whitelist/`AllBalances` |
| **Med** | Price stack (Binance → CryptoCompare → DEX pools) manipulable for **display only**; does **not** affect InstantWithdrawCw20 |
| **Med** | Hardcoded mainnet addresses in frontend constants (not env-driven) |
| **Med** | Fixed gas limits without simulation (Terra Classic LCD limitation) |
| **Low** | No CSP; console logs full execute payloads; WalletConnect project ID public-by-design |
| **Info** | No Playwright/Cypress/Vitest e2e in repo; no committed secrets/keys found in first-party code |

**Oracle manipulation vs MR !6:** InstantWithdrawCw20 and pull limits have **no price oracle**. Manipulation of Binance/DEX quotes cannot forge a treasury Transfer or alter quota accounting. Economic risk sits in **ust1-window** pricing/burn logic (out of repo) and in **UI mispricing** of collateral ratios.

---

## Common attack classes — applicability

| Class | Applicable to InstantWithdrawCw20 + limits? | Result |
|-------|---------------------------------------------|--------|
| Access control bypass | Yes | **Mitigated** (spender map + gov-only set + fail-closed limit) |
| Privilege escalation | Yes | **Only via gov key** (H-1) |
| Reentrancy / Receive callback | Yes | **Low** — Transfer not Send; tx atomic |
| Integer overflow / underflow | Yes | **Mitigated** — `checked_add` + Uint128 |
| Flash-loan / same-block TOCTOU | Limited on CosmWasm | **OK** across sequential txs |
| Oracle manipulation | No on this path | N/A for IW; UI-only elsewhere |
| Economic drain / rug | Yes | **Bounded** on IW by `limit_24h` (~2× burst); unlimited via ExecuteWithdraw (gov+7d) |
| Governance attack | Yes | Instant spender/limit set; Phase-1 EOA |
| Storage collision / migrate | Yes | **Mitigated** (namespaces + name check) |
| Tumbling window gaming | Yes | **Accept** ~2× burst (documented) |
| Allowance phishing | N/A (no allowance design) | By design Option 3 |
| Database dump / SQLi | No server/DB | N/A |
| XSS → key theft | Frontend | No keys in app; XSS impact limited |
| IBC / bridge | Not in first-party IW | Out of scope |

---

## Missing security features (gap list)

1. ~~On-chain per-token / per-spender pull cap~~ → **Done in MR !6** (fail-closed).
2. Timelock (or two-step remove+set) on `SetCw20Spender` / `SetCw20SpenderLimit` (product chose none).
3. `SetCw20SpenderLimit` verify spender matches registry.
4. Inventory reservation between InstantWithdrawCw20 and pending ProposeWithdraw.
5. Monitoring attribute `old_spender` on overwrite.
6. cw-multi-test / LocalTerra e2e for CW20 IW + pull-limit balance proof.
7. Cross-repo integration tests with ust1-window (limit error UX).
8. GitLab CI running contract tests on MR.
9. Frontend e2e (wallet, LCD failure modes, treasury vs on-chain balances).
10. Ops runbook: “full stop” (`cw20_iw_paused` + cancel pending withdraws + wrapping pause + wrap-mapper pause).
11. Multisig Phase-2 governance before enabling mainnet spender.
12. wrap-mapper fail-closed rate limits (align with treasury #7 policy).
13. Fix `deploy.sh` USTR decimals / mint field.
14. Treasury unit tests: A2, A7 boundary burst, overflow, ExecuteWithdraw bypass.

---

## Positive controls (correctly implemented)

1. Fail-closed when limit unset/removed (`Cw20PullLimitNotSet`).
2. Tumbling 86400s window with `checked_add` overflow protection.
3. Solvency query before quota accounting; auth before usage write.
4. Per-(token, spender) isolation; rotation clears old pair state.
5. Strict `info.sender == CW20_SPENDERS[token]`; gov not implicit spender.
6. Independent pause flags (window redeem survives wrap pause).
7. Typed CW20 Transfer only — no arbitrary WasmMsg.
8. Distinct storage namespaces; additive migrate.
9. `window_seconds` not gov-tunable to 0 (hardcoded constant).
10. Docs/skill updated: retired “no on-chain pull cap v1”; ops fail-closed sequence documented.
11. ~16 dedicated pull-limit unit tests covering T1–T14/T16–T17 core paths.
12. wrap-mapper native InstantWithdraw ABI unchanged (100 wrap-mapper tests green per MR).

---

## Sign-off matrix (A1–A14)

| Vector | Code | Tests | Process | Sign-off |
|--------|------|-------|---------|----------|
| A1 Drain via many small pulls | OK | Partial | Size limit | **Approve** |
| A2 Single pull ≫ limit | OK | Missing | — | **Approve** (add test P1) |
| A3 ProposeWithdraw bypass | OK (by design) | Partial | IR docs | **Accept risk** |
| A4 Native InstantWithdraw | N/A | — | — | **N/A** |
| A5 Spoof spender / wrong token | OK | OK | — | **Approve** |
| A6 Overflow | OK | Missing | — | **Approve** (add test P2) |
| A7 Window boundary burst | OK (documented) | Missing | Size ≤50% target daily | **Accept risk** |
| A8 limit=0 | OK | OK | — | **Approve** |
| A9 Same-block race | OK | Untested | — | **Approve** |
| A10 Storage collision | OK | Migrate smoke | — | **Approve** |
| A11 Malicious SetCw20Spender | OK (gov-only) | Partial | **Multisig + checklist** | **Accept risk** |
| A12 Stale usage on rotate | OK | OK | — | **Approve** |
| A13 Gov tiny limit mid-flight | OK (fail-closed) | Missing | Ops playbook | **Accept risk** |
| A14 Pause off + exhausted | OK | OK | — | **Approve** |

**Overall:** Approve treasury migrate of InstantWithdrawCw20 **+ 24h pull limits**. **Hold** mainnet `SetCw20Spender` / redeem enablement until companion window audit + ops gates + production `limit_24h` sized for tumbling burst.

---

## Prior audit follow-up (#6 / `INTERNAL_COMPOSER_1785465508`)

| Prior ID | Issue | MR !6 status |
|----------|-------|--------------|
| **H-2** | No on-chain pull cap | **Mitigated** on InstantWithdrawCw20; residual via ExecuteWithdraw + ~2× burst |
| **M-1** | No per-spender pull cap | **Closed** for instant path |
| **H-1** | No timelock on SetCw20Spender | **Unchanged** — also applies to limit msgs |
| **H-3** | Ops / companion trust | **Unchanged** (still open) |
| **M-2** | Dual outflow race | **Unchanged** |
| **M-4** / **M-6** | Pause vs ExecuteWithdraw | **Unchanged** |
| **M-5** | No cw-multi-test | **Unchanged** |
| **P3** | v2 pull cap | **Done** as #7 |

---

## Recommended follow-ups (priority)

| P | Action |
|---|--------|
| **P0** | Before mainnet `SetCw20Spender`: verify window code ID/checksum, dual-operator address check, set `limit_24h` **in same tx**, query `Cw20SpenderLimit`, small redeem smoke |
| **P0** | Prefer multisig governance (Phase 2) before registering live spender |
| **P0** | Size production `limit_24h` at ≤ ~50% of desired calendar-day cap (tumbling 2× burst) |
| **P1** | Add unit tests: A2 exceed-with-ample-balance, A7 boundary burst, overflow, ExecuteWithdraw bypass, mid-window lower limit |
| **P1** | cw-multi-test: mock CW20 → register+limit → pulls → exceed → advance 24h → success; assert balances |
| **P1** | Ops “full halt” runbook covering all pause surfaces + cancel pending withdraws |
| **P1** | Fail-closed frontend swap sim; never ship `VITE_DEV_MODE`; validate referral before persist |
| **P2** | Enforce spender∈registry on `SetCw20SpenderLimit`; emit `old_spender` on rotation |
| **P2** | GitLab CI: `cargo test --package treasury --lib` (+ wrap-mapper) on MRs |
| **P2** | Fix `deploy.sh` USTR decimals=18 + `mint` field; consider wrap-mapper fail-closed rate limits |
| **P3** | Optional timelock on SetCw20Spender/Limit; shared inventory with ExecuteWithdraw |
| **P3** | Frontend treasury UI from on-chain `AllBalances`; CSP |

---

## Finding counts

| Scope | Crit | High | Med | Low | Info |
|-------|------|------|-----|-----|------|
| MR !6 / #7 primary | 0 | 4 | 7 | 4 | 10 |
| Broader contracts | 0 | 5 | 9 | — | — |
| Frontend / ops / DB | 0 | 4* | 8 | 5 | 7 |

\*Frontend/ops High overlaps with H-1/H-4 process items (CI, VITE_DEV_MODE, sim fallback, deploy key centralization).

---

## Sources

- `glab mr view 6`, `glab mr diff 6`, `glab issue view 7`
- Commit `b9cd7cc` / merge `98fc4de`
- Code: `contracts/contracts/treasury/src/{contract,msg,state,error,lib}.rs`
- Reference: `contracts/contracts/wrap-mapper/src/{contract,state}.rs` rate-limit pattern
- Docs: `docs/{CONTRACTS,ARCHITECTURE,DEPLOYMENT,ECONOMICS}.md`, `skills/treasury-cw20-instant-withdraw/SKILL.md`
- Prior: `audits/INTERNAL_COMPOSER_1785465508.md`
- Subagents (Composer 2.5): threat-surface inventory; treasury pull-limit audit; multi-contract audit; frontend/ops audit

---

*End of INTERNAL_COMPOSER_1785466856*
