---
name: frontend-treasury-available-supply
description: >-
  Treasury available-supply accounting, protocol-token CR haircut, and gated
  Key Ratios color tiers (GitLab #16). Use when changing useTreasury inventory,
  availableSupply, crTiers, IssuanceCard / RatiosCard, or CR denominator.
---

# Frontend available-supply CR + gated tiers (#16)

Companion: [#16](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/16). Revises [#11](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/11) / [frontend-ust1-ratios](../frontend-ust1-ratios/SKILL.md) and [#14](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/14) / [frontend-treasury-lp-nav](../frontend-treasury-lp-nav/SKILL.md). vFDUSD USD: [#10](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/10) / [frontend-vfdusd-oracle](../frontend-vfdusd-oracle/SKILL.md). CL8Y catalog / new pins: [#18](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/18) / [frontend-treasury-cl8y-holdings](../frontend-treasury-cl8y-holdings/SKILL.md). CL8Y-cb/cUSTC pin: [#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20). Economics bands: [docs/ECONOMICS.md](../../docs/ECONOMICS.md). Holdings tile layout (display-only): [#21](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/21) / [frontend-treasury-assets-layout](../frontend-treasury-assets-layout/SKILL.md).

Cross-links: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [frontend/src/utils/availableSupply.ts](../../frontend/src/utils/availableSupply.ts), [frontend/src/utils/crTiers.ts](../../frontend/src/utils/crTiers.ts), [frontend/src/utils/treasuryRatios.ts](../../frontend/src/utils/treasuryRatios.ts), [frontend/src/hooks/useTreasury.ts](../../frontend/src/hooks/useTreasury.ts).

## Why this exists

Counting UST1 / USTR (or their LP legs) as assets is treasury-stock distortion. Gross `total_supply` as the CR denominator treats CMM-owned float as public liability. Partial prices must not paint a GREEN/BLUE CR.

## Pins (do not invent)

| Name | Address | Decimals | Role |
|------|---------|----------|------|
| Treasury | `terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2` | — | Only CMM holder for owned liquidity |
| UST1 | `terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72` | 6 | Liability; not a CR asset |
| USTR | `terra1vy3kc0swag2rhn7jz6n72jp0l2ns0p6r6ez5grxq5uhj2rvs97fqfsetxv` | 18 | Ecosystem equity; not a CR asset or CR liability |
| cLUNC | `terra1437qslye72t7qmmahn4t5chz50r8a62g45phwkquwpyu2l62u6ksqssgdg` | 6 | Wrap receipt |
| cUSTC | `terra1nap4dxh9tv35v0ynd9m4k6zt6c0dq6weszc4j5m564kjls56hu7qcr56ch` | 6 | Wrap receipt |

Finder: `https://finder.terraclassic.community/columbus-5`.

## Invariants (must hold)

1. **Not CR assets** (spot or LP leg): pinned UST1, USTR, cUSTC, cLUNC. Native `uluna` / `uusd` **are** assets. Protocol issued tokens **do** appear as holdings tiles when CMM holds them, and they **do** enter **Total CMM Assets**.
2. **LP `crUsd`** = reserve NAV of `kind === 'other'` only. `ust1` / `ustr` / `wrap` / `unknown` are out. Unknown on a pinned LP → `crUsd = null` → Key Ratios hidden.
3. **Display NAV / Total CMM Assets** include protocol legs and CMM-held protocol spot. CR CMM Assets omit them.
4. **CMM-owned** = treasury **spot** + pro-rata allowlisted LP claims `floor(reserve_i × lp_balance / total_share)`. Treasury pin only. No window / wrap-mapper / `all_accounts` / LCD tx crawl. One claim per LP address.
5. **Available supply** = outstanding − CMM-owned. Outstanding = `getTokenInfoStrict`. Spot / LP balance = `getTokenBalanceStrict`. Negative would-be float → clamp display 0 and **fail closed**.
6. **CR denominator** = **CR CMM Liabilities** = available supply of UST1 ($1 debt) + cUSTC (USTC USD debt) + cLUNC (LUNC USD debt). USTR is equity and is **not** a CR liability. `∞` only when those debt inventories are certified **and** CR liabilities === 0. Failure → hide Key Ratios, never `∞`.
7. **Liability units:** 1 UST1 = $1. Wraps use native LUNC/USTC USD. USTR uses a mapped print or the UST1/USTR pool reserve ratio for **Total CMM Assets** only — never invented $1. Do not put protocol issued tokens in the CR numerator or USTR in the CR denominator.
8. **Price gate:** Key Ratios body is exactly `prices not loaded, cannot display key ratios` unless every CR-relevant spot (`balance > 0`) and every LP `other` leg is priced **and** CR liabilities are known. Total CMM Assets may show N/A independently if protocol spot is unpriced.
9. **Tiers** (status display, not on-chain enforcement): RED `<95`, YELLOW `[95, 110)`, GREEN `[110, 190]`, BLUE `>190` including `∞`.
10. **Decimals:** `rawToWholeNumber` only. UST1/wraps/native 6; USTR / CL8Y-cb / USDT 18; CL8Y LP mint 18.
11. **Skip list exact:** `UST1-USTR` is not `UST1`. `type: "lp"` never uses the raw-protocol skip. The skip list still keeps protocol tokens out of the generic tokenlist CR loop; `useTreasury` injects them as Total-only rows.
12. **No** missing USD as `$0` / `$1`. No LP mint `simulate_swap`. vFDUSD remains session oracle.

## Tests

```bash
cd frontend && npm test
```

Fixtures: 1e6 available + $2e6 assets → 200% / BLUE. Same assets + 500k CMM-owned → 400%. Protocol spot in Total not CR. Wrap debt in liabilities; USTR equity omitted; CMM-owned is the haircut.
