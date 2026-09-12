---
name: frontend-treasury-lp-nav
description: >-
  Allowlisted protocol LP shares as treasury assets with reserve NAV USD;
  only non-protocol (`other`) legs enter CR (GitLab #14, revised by #16;
  CL8Y-cb/cUSTC pin #20).
  Use when changing tokenlist type:lp, lpNav, lpEligibility, treasuryLp,
  useTreasury LP merge, or LP row *data* on TreasuryAssetsCard.
  Tile layout / ellipsis / breakpoints: frontend-treasury-assets-layout (#21).
---

# Frontend protocol LP NAV + CR (#14, revised by #16 / #20)

Companion: [#14](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/14), CR haircut revised by [#16](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/16) / [frontend-treasury-available-supply](../frontend-treasury-available-supply/SKILL.md). Liability/CR core: [#11](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/11) / [frontend-ust1-ratios](../frontend-ust1-ratios/SKILL.md). vFDUSD USD: [#10](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/10) / [frontend-vfdusd-oracle](../frontend-vfdusd-oracle/SKILL.md). CL8Y-cb/cUSTC pin: [#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20). Catalog vs LCD hold: [#18](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/18) / [frontend-treasury-cl8y-holdings](../frontend-treasury-cl8y-holdings/SKILL.md). Tile layout (no ellipsis, 3-col only at `xl`): [#21](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/21) / [frontend-treasury-assets-layout](../frontend-treasury-assets-layout/SKILL.md).

Cross-links: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [frontend/src/utils/lpNav.ts](../../frontend/src/utils/lpNav.ts), [frontend/src/hooks/useTreasury.ts](../../frontend/src/hooks/useTreasury.ts), [frontend-treasury-assets-layout](../frontend-treasury-assets-layout/SKILL.md).

## Why this exists

Treasury may hold DEX LP for `UST1/xxx`, `USTR/xxx`, `cUSTC/xxx`, `cLUNC/xxx`, and other allowlisted pairs the treasury actually holds (CL8Y-cb/cUSTC, CL8Y-cb/ALPHA, cLUNC/cUSTC, USDT/cLUNC). Spot `simulate_swap` of an LP mint is the wrong price (and easy to manipulate). Display uses **reserve NAV**. CR uses only **external** (`other`) legs — UST1/USTR/wrap legs are treasury stock / wrap receipts, not collateral (#16). Raw UST1 / USTR / wraps stay off the holdings loop (#11); CMM-held protocol spot is injected as Total-only tiles. CL8Y-cb is `other` (known spot CW20) and **does** enter CR. USDT is `other` (known 18dp spot CW20) and **does** enter CR.

## Pins (do not invent)

| Name | Address | Role |
|------|---------|------|
| Treasury | `terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2` | LP holder |
| UST1 | `terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72` | Liability; LP leg **display** $1, **out** of CR |
| USTR | `terra1vy3kc0swag2rhn7jz6n72jp0l2ns0p6r6ez5grxq5uhj2rvs97fqfsetxv` | Raw skip; LP leg **out** of CR |
| cLUNC | `terra1437qslye72t7qmmahn4t5chz50r8a62g45phwkquwpyu2l62u6ksqssgdg` | Wrap; LP leg display only |
| cUSTC | `terra1nap4dxh9tv35v0ynd9m4k6zt6c0dq6weszc4j5m564kjls56hu7qcr56ch` | Wrap; LP leg display only |
| CL8Y-cb | `terra16wtml2q66g82fdkx66tap0qjkahqwp4lwq3ngtygacg5q0kzycgqvhpax3` | Spot CW20 (18dp); LP `other` leg **in** CR ([#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20)) |
| USDT | `terra1z0xe7t5ymmltg4vju8tghkq0pewy4et548ta23nlu9zxtl950uyqkv8mv4` | Spot CW20 (18dp); LP `other` leg **in** CR |
| CL8Y-cb/cUSTC pair | `terra1tz5vwrungh6drd9nt95qym3k892vs3as8nqmu7sg4ypek7wxvv4qm89upc` | Spot USD = LCD `{ pool: {} }` reserve ratio (not simulate-swap) |
| CL8Y-cb/cUSTC LP | `terra1u277xxcknv2r37d7xa5mnyxu3q26fyu9e9uexmyu2u99g3qfx62q2jen2c` | 18dp LP mint; pin only because LCD treasury balance > 0 |
| cLUNC/cUSTC pair | `terra15rl8g308yzzt5kxu4skgwlahrvm8adyv0s2cupsmvte0akgs2ttsszau38` | Both wrap legs; Total NAV only |
| cLUNC/cUSTC LP | `terra132uuzdnjce0c8g5dalyvdgl47ny697udesk972cg05e5y7gn485qz6tdch` | 18dp LP mint; LCD treasury ~100% of pool (2026-09-08) |
| USDT/cLUNC pair | `terra17l7eqc5j8vkm09up55etfggpr6y92ka6p03yc765mt3nerqcnhdsl6l7jq` | USDT other-leg in CR; cLUNC wrap haircut |
| USDT/cLUNC LP | `terra10ur635zd6fmt4fxveven8lcx8xkr55t6dxjxh5dctmcc5lrxjqqslq4l3s` | 18dp LP mint; LCD treasury ~100% of pool (2026-09-12) |

Pair / LP CW20 addresses are **tokenlist `type: "lp"` pins only**. Do not invent factory results into CR. Garuda / CL8Y LP mint is often **not** the pair (`liquidity_token`). Discover CL8Y pairs from `https://indexer.dex.cl8y.com/api/v1/pairs` — still pin into tokenlist; indexer is not CR input. Catalog vs pin + LCD hold check: [frontend-treasury-cl8y-holdings](../frontend-treasury-cl8y-holdings/SKILL.md) / [#18](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/18). CL8Y-cb/cUSTC was pinned after LCD hold ([#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20)); do not factory-paginate other CL8Y pairs.

Supported dex strings: `cl8y`, `garuda`, `terraswap`, `terraport`. CL8Y LP CW20 decimals are **18** (confirm `token_info`).

## Invariants (must hold)

1. **Allowlist**: a pair is in the grid/CR only if `tokenlist.json` has `type: "lp"` with pinned `address` (LP CW20) + `pool.address` (pair) + `pool.assets` that match on-chain reserves.
2. **No factory crawl**: do not paginate `pairs`. Factory `pair` may be an ops checker only — never CR input.
3. **Skip list is exact**: `TREASURY_HOLDING_SKIP_SYMBOLS` is `USTR|UST1|CLUNC|CUSTC`. `UST1-USTR` is not skipped. `type: "lp"` never uses the raw-protocol skip. CMM-held protocol **spot** is injected by `useTreasury` as Total-only tiles (not via the tokenlist CR loop).
4. **NAV not spot**: `claim_i = floor(reserve_i * lp_balance / total_share)`. Never `getTokenPriceUsd(lpAddress)`. Unpriced **ustr/other** legs may use the priced peer reserve ratio for **display**. Do not imply wrap or unknown. Asset row shows **% of pool**, not 18dp LP dust.
5. **UST1 leg = $1 for display only** (liability unit). Do not use a DEX UST1 print. **Not** a CR numerator input (#16).
6. **Protocol haircut**: pinned UST1 / USTR / cLUNC / cUSTC legs are in `displayUsd`, **out** of `crUsd`. Haircut **only** pinned addresses (fake `cUSTC` is `unknown` → fail-closed LP).
7. **`isCrEligibleLeg` is `other` only.** USTR-in-LP is **not** collateral (#16 supersedes the #14 “USTR in LP is CR” rule).
8. **Fail closed**: unknown dex, unknown leg, `total_share == 0`, `lp_balance > total_share`, reserve/declared mismatch, LP token ≠ `liquidity_token`, unpriced CR-eligible (`other`) leg → `crUsd = null`, incomplete. Never missing USD as `$0` or `$1`. LP row copy lists `missingPriceLegs` (e.g. `NAV incomplete · CL8Y-cb`). Key Ratios stays gated (`prices not loaded…`) per #16 — do not invent a second banner.
9. **vFDUSD** as an LP quote still uses the session oracle — never DEX-simulate vFDUSD.
10. **Decimals**: `rawToWholeNumber` only. UST1/wraps/native 6; USTR / CL8Y-cb / USDT 18. CL8Y LP mint is 18. CL8Y-cb / USDT spot USD offer is `10^18`, never the historical 1e6 Garuda fallback.
11. **Ops**: governance `AddCw20` each LP CW20 so `AllBalances` stays consistent. UI does not silently drop a pin if whitelist lags. Optional for #20: `AddCw20` `terra1u277x…jen2c`. For USDT/cLUNC: `AddCw20` `terra10ur6…q4l3s`.
12. **Addresses**: pinned `terra1…` only (`isTerraContractAddress`).
13. **CMM-owned claims** from these LPs feed available supply — see [frontend-treasury-available-supply](../frontend-treasury-available-supply/SKILL.md). Failed pool with `lp_balance > 0` fail-closes that pin’s protocol inventory. cUSTC LP claims reduce cUSTC available (CR CMM Liabilities); wrap receipts are Total assets only, never CR assets.

## tokenlist shape

```json
{
  "symbol": "UST1-USTR",
  "name": "UST1/USTR LP",
  "type": "lp",
  "address": "<lp cw20>",
  "decimals": 18,
  "pool": {
    "address": "<pair>",
    "dex": "cl8y",
    "name": "LP UST1/USTR",
    "assets": [
      { "symbol": "UST1", "address": "terra1f0eq…fy72" },
      { "symbol": "USTR", "address": "terra1vy3k…setxv" }
    ]
  }
}
```

Native legs use `denom` (`uluna`, `uusd`).

## Tests

```bash
cd frontend && npm test
```

Fixtures: UST1/USTR 10% → display $200, `crUsd = 0`; UST1/cUSTC display $101 / CR $0; UST1/vFDUSD CR = vFDUSD side only; CL8Y-cb/cUSTC CR = CL8Y side only (wrap haircut); unpriced CL8Y + unpriced wrap → `crUsd = null` and `missingPriceLegs` includes `CL8Y-cb`; $2e6 spot + $1e5 LP `other` `crUsd` → 210% CR.
