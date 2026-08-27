---
name: frontend-treasury-cl8y-holdings
description: >-
  Discover CL8Y LPs the CMM treasury actually holds; indexer catalog vs
  tokenlist pins (GitLab #18, CL8Y-cb/cUSTC pin #20). Use when adding type:lp pins, indexer ingest,
  or speeding treasury LCD load.
---

# CL8Y holdings discovery (#18)

Companion: [#18](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/18). CL8Y-cb/cUSTC pin: [#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20). CR math: [frontend-treasury-available-supply](../frontend-treasury-available-supply/SKILL.md) / [#16](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/16). Allowlist NAV: [frontend-treasury-lp-nav](../frontend-treasury-lp-nav/SKILL.md) / [#14](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/14).

Cross-links: [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [frontend/src/utils/cl8yHoldings.ts](../../frontend/src/utils/cl8yHoldings.ts), [frontend/scripts/discover-cl8y-holdings.mjs](../../frontend/scripts/discover-cl8y-holdings.mjs), [frontend/scripts/verify-treasury-cr.mjs](../../frontend/scripts/verify-treasury-cr.mjs).

## Why this exists

Treasury receives CL8Y DEX LP (and sometimes underlyings). The page must **not** crawl factory `pairs` into CR. Indexer `GET /api/v1/pairs` is a **catalog** so agents can find new pairs; LCD confirms whether the pinned treasury holds the LP CW20.

## Pins (do not invent)

| Name | Address | Role |
|------|---------|------|
| Treasury | `terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2` | Only holder that counts as CMM-owned |
| Indexer catalog | `https://indexer.dex.cl8y.com/api/v1/pairs` | `pair_address` + `lp_token` only |

**Held + pinned (LCD 2026-08-27):** UST1/USTR, UST1/cUSTC, UST1/SpaceUSD, **CL8Y-cb/cUSTC ([#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20))**, CL8Y-cb/ALPHA, UST1/ALPHA — see [frontend-treasury-lp-nav](../frontend-treasury-lp-nav/SKILL.md) and tokenlist `1.3.3`. ALPHA pairs were LCD-held at the same check; they are not factory-invented. Do not pin catalog-only rows.

**Catalog only (treasury LP balance 0 — do not pin):**

| Pair | Pair contract | LP CW20 |
|------|---------------|---------|
| cLUNC/UST1 | `terra1su536…mm7h4` | `terra1mk3kr…2cagk` |
| CL8Y-cb/cLUNC | `terra1q5kar…wqvq0` | `terra13rfqc…0jcwu` |
| cLUNC/cUSTC | `terra15rl8g…szau38` | `terra132uuz…z6tdch` |

Unrelated gems (EMBER/CORAL/…) stay out.

## Invariants (must hold)

1. **Catalog ≠ CR.** Indexer pairs, candles, hub prices, and trader positions are **not** CR inputs. LCD `{ pool: {} }` + CW20 balances are.
2. **No factory crawl** into the holdings grid or CR. `diffCl8yCatalog` / the discover script never writes `tokenlist.json`.
3. **Hold signal is LCD** `balance` of `lp_token` at the treasury pin. Indexer `GET /api/v1/traders/{treasury}/positions` was `[]` on 2026-08-25 while treasury held three LPs — **do not** use it as a hold or as a speed-up for CR.
4. **Fail closed on stale indexer.** 5xx / missing `items` → discovery incomplete. The Treasury page keeps using tokenlist + LCD.
5. **Pin then `AddCw20`.** A new held LP enters CR only after a `type: "lp"` pin **and** governance whitelist (live `Cw20Whitelist` is still empty — `AllBalances` is native-only; UI must keep querying pins).
6. **Protocol tokens** (UST1, USTR, cLUNC, cUSTC) stay out of CR numerator **and** are not the CR denominator (denominator is UST1 **available** supply). CL8Y-cb is **not** a protocol token — LP other-leg NAV enters CR ([#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20)). cUSTC LP claims still reduce cUSTC available supply.
7. **Skip-list exactness** unchanged: `UST1-USTR` is not `UST1`.

## Tests

```bash
cd frontend && npm test
node scripts/discover-cl8y-holdings.mjs   # LCD + indexer; exit 2 if held-unpinned
node scripts/verify-treasury-cr.mjs       # independent CR
npm run test:e2e                          # Playwright, 5 workers
```
