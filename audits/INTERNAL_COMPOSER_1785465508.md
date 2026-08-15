# Internal Security Audit — MR !5 / Issue #6 (+ Broader Surfaces)

| Field | Value |
|-------|-------|
| **Date** | 2026-07-31 |
| **Epoch** | `1785465508` |
| **Auditor** | Composer 2.5 (multi-agent) + lead synthesis |
| **Focus** | [MR !5](https://gitlab.com/PlasticDigits2/ustr-cmm/-/merge_requests/5) — `feat(treasury): CW20 InstantWithdraw + spender registry (#6)` |
| **Issue** | [#6](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/6) (closed; companion [ust1-window#20](https://gitlab.com/PlasticDigits/ust1-window/-/work_items/20)) |
| **Repo revision** | `master` @ `b0b07e4` (MR merged); `cargo test --package treasury --lib` → **134 passed** |
| **Method** | `glab` for MR/issue; code review of treasury/wrap-mapper/ustc-swap/airdrop/referral/cw20-mintable/frontend/docs; four Composer 2.5 subagents (threat-surface map, treasury CW20 path, other contracts, frontend/ops) |
| **Scope note** | Formal A1–A12 sign-off was explicitly deferred in MR !5; this document is that sign-off attempt |

---

## Executive verdict

**On-chain CW20 InstantWithdraw logic is sound** under the product threat model “only audited spenders are registered.” Access control, pause isolation, solvency pre-check, storage namespaces, and zero-amount rejection are correctly implemented. No unprivileged Critical exploit was found in the MR !5 path.

**Conditional sign-off for A4/A12:** both are **accepted product risks**, not implementation bugs:

1. A registered spender can drain the full treasury balance of its token (no on-chain cap).
2. Governance can register/overwrite a spender **instantly** (no timelock), sharper than `ProposeWithdraw`.

**Mainnet readiness:** bytecode is migrate-ready; **do not** execute `SetCw20Spender` until ust1-window is audited, address-verified, and process controls (multisig / dual-operator checklist) are in place.

---

## Threat-surface inventory (extra areas analyzed)

Beyond MR !5 / #6, the following surfaces were mapped and reviewed:

| # | Surface | Path / system | Relevance |
|---|---------|---------------|-----------|
| 1 | Treasury custody (gov, timelock withdraw, whitelist, Receive) | `contracts/contracts/treasury/` | Adjacent |
| 2 | Native wrap InstantWithdraw + wrap-mapper | `treasury` + `wrap-mapper` | Adjacent (ABI must stay stable) |
| 3 | CW20 InstantWithdraw + spender registry | MR !5 | **Direct** |
| 4 | USTC→USTR swap + referral mint inflation | `ustc-swap`, `referral` | Broader |
| 5 | USTR mint authority (`cw20-mintable`) | `contracts/external/cw20-mintable/` | Broader |
| 6 | Airdrop batch `TransferFrom` | `airdrop` | Broader |
| 7 | Frontend wallet / LCD / price oracles | `frontend/src/` | Broader (display trust) |
| 8 | Ops / migrate / `SetCw20Spender` runbooks | `docs/DEPLOYMENT.md`, skill | **Direct** |
| 9 | CI/CD, e2e, LocalTerra smoke | mostly absent | Gap |
| 10 | Database / Rust HTTP server | **none in repo** | N/A (no DB leak vector) |
| 11 | External companion ust1-window | out of repo | **Direct** trust boundary |
| 12 | BSC/Terra preregister submodules | `contracts/external/cmm-ustc-preregister/` | Broader |
| 13 | Economic / CR / collateral commingling | `ECONOMICS.md`, wrap + swap `uusd` | Adjacent |
| 14 | Oracle manipulation | frontend CEX/DEX only; no on-chain oracle in IW path | Broader (UI) |
| 15 | Storage collisions / migrate / wasm admin | treasury `migrate`, AWSM admin | **Direct** |

### Architecture (MR !5 trust map)

```text
User ──WrapDeposit──► Treasury ──NotifyDeposit──► WrapMapper ──Mint──► Wrapped CW20
User ──CW20 Send Unwrap──► WrapMapper ──Burn + InstantWithdraw(native)──► Treasury ──Bank──► User

ust1-window ──InstantWithdrawCw20──► Treasury ──Cw20 Transfer(vFDUSD)──► User
Gov ──SetCw20Spender(no timelock)──► Treasury.cw20_spenders
```

wrap-mapper does **not** call `InstantWithdrawCw20`. Paths are parallel.

---

## Findings — MR !5 / Issue #6 (primary)

### High

| ID | Finding | Location | Notes |
|----|---------|----------|-------|
| **H-1** | **`SetCw20Spender` has no timelock and overwrites silently** — compromised/malicious gov can instantly point vFDUSD spender at an attacker and drain that token next block. Unlike `SetDenomWrapper` (remove-then-set), overwrite is one tx. | `treasury/src/contract.rs:773-788`, `msg.rs:94-97` | Issue **A12**. Documented product choice (parity with `SetDenomWrapper` on “no timelock”, but **stricter overwrite**). |
| **H-2** | **Registered spender can drain full token balance to any recipient (incl. self)** — no on-chain pull cap in v1. | `contract.rs:840-901`, `state.rs:83-84` | Issue **A4**. Window-side limits are the only product control. |
| **H-3** | **Ops / companion trust boundary incomplete** — ust1-window consumer is out of repo; DEPLOYMENT placeholders `$TERRA_VFDUSD` / `$WINDOW_ADDR` lack enforced checksum/code-ID gates, testnet dry-run, or post-wiring redeem smoke. | `docs/DEPLOYMENT.md`, skill | Wrong address = irreversible drain. |

### Medium

| ID | Finding | Location | Notes |
|----|---------|----------|-------|
| **M-1** | No on-chain per-spender/token pull cap (deferred v1) | `state.rs:83-84` | Issue constraint #10 |
| **M-2** | Dual outflow paths without inventory lock — `InstantWithdrawCw20` and timelocked `ExecuteWithdraw` can race the same CW20; loser fails at balance check | `contract.rs:283-419`, `840-901` | Operational over-commit |
| **M-3** | `SetCw20Spender` does not verify `token` implements CW20 | `contract.rs:773-788` | Misconfig fails later at balance query / Transfer |
| **M-4** | `cw20_iw_paused` does **not** stop gov `ExecuteWithdraw` (A10 by design) — IR runbooks may wrongly assume “pause = all CW20 outflows halted” | pause vs `execute_execute_withdraw` | Document for ops |
| **M-5** | Unit tests assert WasmMsg shape only; **no cw-multi-test / LocalTerra** balance proof for InstantWithdrawCw20 | `contract.rs:5266-5306`, `1100-1109` | Verification criterion #2 unmet in-repo |
| **M-6** | Pause-semantics confusion: `wrapping_paused` does not block CW20 IW (intentional for window uptime) | skill, DEPLOYMENT | Ops incident risk |
| **M-7** | Whitelist orthogonal — `AllBalances`/CR may omit tokens drained via InstantWithdrawCw20 if not whitelisted | `state.rs:85-86` | Monitoring gap |

### Low

| ID | Finding | Location | Notes |
|----|---------|----------|-------|
| **L-1** | No dedicated invalid/empty address negative tests (A8); mock_api accepts bech32-shaped strings | `contract.rs:1063-1066` | `addr_validate` present in code |
| **L-2** | No `old_spender` attribute on overwrite — harder to alert on spender rotation | `contract.rs:790-793` | |
| **L-3** | Asymmetric pre-check: InstantWithdrawCw20 checks CW20 balance; `ExecuteWithdraw` CW20 path does not (pre-existing; IW is stricter) | `872-883` vs `396-406` | |
| **L-4** | No exact-balance drain test for CW20 path (native has `test_instant_withdraw_exact_balance`) | — | |
| **L-5** | A4 self-recipient / A10 pause+ProposeWithdraw / A5 reentrancy lack explicit tests | — | Partial coverage |

### Informational (positive / by design)

| ID | Note |
|----|------|
| **I-1** | Storage namespaces distinct: `cw20_spenders`, `cw20_iw_paused`, `cw20_whitelist`, `denom_wrappers` — A11 satisfied |
| **I-2** | Uses `Cw20ExecuteMsg::Transfer` (not `Send`) — no recipient Receive hook; low reentrancy risk (A5) |
| **I-3** | Migrate is additive cw2 version bump; `may_load` pause defaults false; migrate smoke preserves gov/whitelist/wrappers/pending |
| **I-4** | Governance is **not** an implicit spender (tested) |
| **I-5** | Typed Transfer only — no arbitrary WasmMsg from spender path |
| **I-6** | wrap-mapper zero references to InstantWithdrawCw20; native ABI unchanged |

---

## Test coverage matrix (issue #6 T1–T11 / A1–A12)

### Functional (T1–T11)

| ID | Status | Evidence / gap |
|----|--------|----------------|
| T1 SetCw20Spender + query | **pass** | `test_set_cw20_spender_and_query` |
| T2 RemoveCw20Spender | **pass** | `test_remove_cw20_spender` |
| T3 Happy InstantWithdrawCw20 | **partial** | Submsg shape OK; no real CW20 balance delta |
| T4 Replace spender | **pass** | `test_instant_withdraw_cw20_replace_spender` |
| T5 Token isolation | **pass** | `test_instant_withdraw_cw20_token_isolation` |
| T6 Pause on/off | **pass** | `test_cw20_instant_withdraw_pause` |
| T7 Native IW regression | **partial** | CW20 pause ≠ block native; wrap-mapper suite separate |
| T8 wrapping_paused ≠ block CW20 | **pass** | `test_wrapping_paused_does_not_block_cw20_instant_withdraw` |
| T9 ProposeWithdraw CW20 | **pass** | `test_propose_withdraw_cw20_unaffected_by_spender_registry` (ExecuteWithdraw not re-asserted) |
| T10 Migrate smoke | **pass** | `test_existing_features_after_migrate` |
| T11 Whitelist not required | **pass** | `test_instant_withdraw_cw20_without_whitelist` |

### Attack vectors (A1–A12)

| ID | Status | Evidence / gap |
|----|--------|----------------|
| A1 Random caller | **pass** | `test_instant_withdraw_cw20_unauthorized_random` |
| A2 Gov ≠ spender | **pass** | `test_instant_withdraw_cw20_gov_not_implicit_spender` |
| A3 Wrong token | **pass** | `test_instant_withdraw_cw20_token_isolation` |
| A4 Self/attacker recipient | **missing test** | Allowed by design; document only |
| A5 Reentrancy via Transfer | **partial** | Code review; no malicious-CW20 multitest |
| A6 Amount > balance | **pass** | `test_instant_withdraw_cw20_insufficient_balance` |
| A7 Zero amount | **pass** | `test_instant_withdraw_cw20_zero_amount` |
| A8 Spoof/empty token | **partial** | `addr_validate` in code; mock limitation |
| A9 Remove mid-flight | **partial** | Post-remove covered |
| A10 Pause bypass via ProposeWithdraw | **partial** | By design; no explicit paused+propose test |
| A11 Storage collision | **pass** | Distinct keys + migrate smoke |
| A12 Malicious register via gov | **partial** | Non-gov Unauthorized tested; process risk accepted |

**E2E / happy+bad path outside unit mocks:** LocalTerra / rebel live smoke and ust1-window cross-repo redeem smoke are **unchecked** (MR checklist open items).

---

## Findings — adjacent contracts & economics

### High (broader)

| ID | Finding | Location |
|----|---------|----------|
| **HB-1** | **Commingled native `uusd`** — InstantWithdraw (native) can pull full bank balance; same denom may back swap deposits + wraps. First-mover unwrap can starve other obligations. | `treasury/contract.rs:714-721`, wrap-mapper tests |
| **HB-2** | **wrap-mapper trusts treasury `NotifyDeposit` amount** — no on-chain deposit proof; malicious treasury migrate ⇒ unbacked mint. | `wrap-mapper/contract.rs:132-182` |
| **HB-3** | **USTR minter rotation without timelock** (`UpdateMinter`) — minter key compromise ⇒ unlimited mint (if uncapped). | `cw20-mintable` |

### Medium (broader)

| ID | Finding |
|----|---------|
| **MB-1** | Legacy treasury `SwapDeposit` emits `NotifyDeposit` but live ustc-swap exposes `Swap` — path fails atomically if called (dead code / footgun). |
| **MB-2** | wrap-mapper `MIN_FEE_BPS=1` may under-cover Terra Classic tax → slow solvency erosion. **Superseded by [#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9):** asymmetric fees, no gross-up; tax on receiver; see [`skills/wrap-mapper-asymmetric-fees`](../skills/wrap-mapper-asymmetric-fees/SKILL.md). |
| **MB-3** | wrap-mapper minter verification uses `limit: 30` — false reject if mapper not in first page. |
| **MB-4** | ustc-swap admin pause / post-period `RecoverAsset` centralization. |
| **MB-5** | airdrop: unused `admin`; unbounded recipients (gas DoS). |
| **MB-6** | Dual/triple pause surfaces (treasury wrapping, CW20 IW, wrap-mapper paused) — IR complexity. |

### Low / Info (broader)

- Treasury `Receive` accepts any CW20 (accounting via whitelist only).
- Referral: no admin (good); lacks cw-multi-test with real CW20 Send/Burn.
- `ustr-token` crate has no `src/` — production is external `cw20-mintable`.
- `packages/common` is type-only; no unsafe helpers.
- No CosmWasm `Reply`/`SubMsg` callback reentrancy pattern in first-party contracts.

---

## Findings — frontend, ops, “database”, oracles

**No application server and no database exist in this repository.** Classic “DB leak” vectors do not apply. Persistence is CosmWasm contract state + browser `localStorage` (referral codes, wallet address).

| Sev | Finding |
|-----|---------|
| **High** | No GitLab CI / workflow running `cargo test` or frontend security gates for contract changes |
| **High** | `VITE_DEV_MODE=true` in a prod build bypasses launch gating / mocks swap status |
| **High** | Client-side swap simulation fallback (hardcoded 1.5 rate / 10% bonus) on LCD failure — deceptive quotes |
| **Med** | Referral URL path persisted without format validation; UI claims bonus before on-chain validate |
| **Med** | LCD/RPC trust + stale cache; treasury UI uses `tokenlist.json` not on-chain whitelist/`AllBalances` |
| **Med** | Price stack (Binance → CryptoCompare → DEX pools) manipulable for **display only**; does **not** affect InstantWithdrawCw20 |
| **Med** | Hardcoded mainnet addresses in frontend constants |
| **Low** | No CSP; console logs full execute payloads; WalletConnect project ID public-by-design |
| **Info** | No Playwright/Cypress/Vitest e2e in repo |

**Oracle manipulation vs MR !5:** InstantWithdrawCw20 has **no price oracle**. Manipulation of Binance/DEX quotes cannot forge a treasury Transfer. Economic risk sits in **ust1-window** pricing/burn logic (out of repo) and in **UI mispricing** of collateral ratios.

---

## Common attack classes — applicability

| Class | Applicable to InstantWithdrawCw20? | Result |
|-------|--------------------------------------|--------|
| Access control bypass | Yes | **Mitigated** (spender map + gov-only set) |
| Privilege escalation | Yes | **Only via gov key** (H-1) |
| Reentrancy / Receive callback | Yes | **Low** — Transfer not Send; no mid-handler state |
| Integer overflow / underflow | Yes | **Mitigated** — Uint128 + pre-check |
| Flash-loan / same-block TOCTOU | Limited on CosmWasm (tx atomic) | **OK** across sequential txs |
| Oracle manipulation | No on this path | N/A for IW; UI-only elsewhere |
| Economic drain / rug | Yes | **Accepted** if spender or gov malicious (H-2/H-1) |
| Governance attack | Yes | Instant spender set; Phase-1 EOA |
| Storage collision / migrate | Yes | **Mitigated** (namespaces + name check) |
| Allowance phishing | N/A (no allowance design) | By design Option 3 |
| Front-running spender rotation | Minor | Old spender fails after overwrite included |
| Database dump / SQLi | No server/DB | N/A |
| XSS → key theft | Frontend | No keys in app; XSS impact limited |
| IBC / bridge | Not in first-party IW | Out of scope |

---

## Missing security features (gap list)

1. On-chain per-token / per-spender pull cap (optional v1 — documented deferral).
2. Timelock (or two-step remove+set) on `SetCw20Spender` (product chose none).
3. Token CW20-interface check at registration time.
4. Inventory reservation between InstantWithdrawCw20 and pending ProposeWithdraw.
5. Monitoring attribute `old_spender` on overwrite.
6. cw-multi-test / LocalTerra e2e for CW20 IW balance proof.
7. Cross-repo integration tests with ust1-window.
8. GitLab CI running contract tests on MR.
9. Frontend e2e (wallet, LCD failure modes, treasury vs on-chain balances).
10. Ops runbook: “full stop” procedure (`cw20_iw_paused` + cancel pending withdraws + wrapping pause + wrap-mapper pause).
11. Multisig Phase-2 governance before enabling mainnet spender (docs already plan this).

---

## Positive controls (correctly implemented)

1. Strict `info.sender == CW20_SPENDERS[token]` with distinct errors.
2. Independent pause flags (window redeem survives wrap pause).
3. Solvency query before emitting Transfer; zero amount rejected.
4. Typed CW20 Transfer only — no arbitrary WasmMsg.
5. Distinct storage namespaces (A11).
6. Non-breaking native InstantWithdraw ABI for wrap-mapper.
7. Additive migrate preserving existing state.
8. Governance not implicit spender.
9. ~18 dedicated CW20-IW unit tests covering auth, pause isolation, replace, whitelist orthogonality.
10. Docs/skill explicitly call out A4/A12 and no-cap model.

---

## Sign-off matrix (A1–A12)

| Vector | Code | Tests | Process | Sign-off |
|--------|------|-------|---------|----------|
| A1 Unauthorized caller | OK | OK | — | **Approve** |
| A2 Gov not spender | OK | OK | — | **Approve** |
| A3 Cross-token pull | OK | OK | — | **Approve** |
| A4 Recipient = attacker/self | OK (allowed) | Missing explicit | Window audit required | **Accept risk** |
| A5 Reentrancy | OK (Transfer) | Partial | Register real CW20 only | **Approve** (conditional) |
| A6 Over-balance | OK | OK | — | **Approve** |
| A7 Zero amount | OK | OK | — | **Approve** |
| A8 Spoof token addr | OK (`addr_validate`) | Partial (mock) | Ops verify bech32 | **Approve** |
| A9 Remove mid-flight | OK | Partial | — | **Approve** |
| A10 Pause vs ProposeWithdraw | OK (by design) | Partial | IR docs needed | **Approve** |
| A11 Storage collision | OK | Migrate smoke | — | **Approve** |
| A12 Malicious SetCw20Spender | OK (gov-only) | Partial | **Multisig + checklist before mainnet Set** | **Accept risk** |

**Overall:** Approve treasury migrate of InstantWithdrawCw20 API. **Hold** mainnet `SetCw20Spender` until companion window audit + ops gates.

---

## Recommended follow-ups (priority)

| P | Action |
|---|--------|
| **P0** | Before mainnet `SetCw20Spender`: verify window code ID/checksum, dual-operator address check, query `cw20_spenders` after tx, small redeem smoke |
| **P0** | Prefer multisig governance (Phase 2) before registering live spender |
| **P1** | Add cw-multi-test: mock CW20 → register → InstantWithdrawCw20 → assert balances |
| **P1** | Explicit unit tests: A4 self-recipient, A10 ProposeWithdraw while CW20 paused, exact-balance drain |
| **P1** | Ops “full halt” runbook covering all pause surfaces + cancel pending withdraws |
| **P2** | Emit `old_spender` on SetCw20Spender overwrite; alert on spender changes |
| **P2** | GitLab CI: `cargo test --package treasury --lib` (+ wrap-mapper) on MRs |
| **P3** | v2: optional pull cap / optional SetCw20Spender timelock |
| **P3** | Frontend: validate referral codes before persistence; fail closed on sim fallback; never ship `VITE_DEV_MODE` |

---

## Sources

- `glab mr view 5`, `glab mr diff 5`, `glab issue view 6`
- Commit `24062f9` / merge `b0b07e4`
- Code: `contracts/contracts/treasury/src/{contract,msg,state,error,lib}.rs`
- Docs: `docs/{CONTRACTS,ARCHITECTURE,DEPLOYMENT,ECONOMICS}.md`, `skills/treasury-cw20-instant-withdraw/SKILL.md`, `plans/NATIVE_TOKEN_WRAPPING.md`
- Subagents (Composer 2.5): threat-surface inventory; treasury CW20 audit; multi-contract audit; frontend/ops audit

---

*End of INTERNAL_COMPOSER_1785465508*
