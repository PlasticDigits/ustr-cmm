---
name: frontend-ust1-ratios
description: >-
  Live UST1 circulating, cLUNC/cUSTC wrap supply, and CR from UST1 outstanding
  (GitLab #11). Use when changing useTreasury ratio math, IssuanceCard /
  RatiosCard, or CONTRACTS.ust1Token / cLunc / cUstc.
---

# Frontend UST1 issuance + CR (#11)

Companion: [#11](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/11). Numerator prices including vFDUSD: [#10](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/10) / [frontend-vfdusd-oracle](../frontend-vfdusd-oracle/SKILL.md). Protocol LP NAV in the numerator: [#14](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/14) / [frontend-treasury-lp-nav](../frontend-treasury-lp-nav/SKILL.md). Economics tiers: [docs/ECONOMICS.md](../../docs/ECONOMICS.md).

Cross-links: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [frontend/src/utils/treasuryRatios.ts](../../frontend/src/utils/treasuryRatios.ts), [frontend/src/hooks/useTreasury.ts](../../frontend/src/hooks/useTreasury.ts).

## Pins (do not invent)

| Name | Address | Decimals |
|------|---------|----------|
| UST1 | `terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72` | 6 |
| cLUNC | `terra1437qslye72t7qmmahn4t5chz50r8a62g45phwkquwpyu2l62u6ksqssgdg` | 6 |
| cUSTC | `terra1nap4dxh9tv35v0ynd9m4k6zt6c0dq6weszc4j5m564kjls56hu7qcr56ch` | 6 |

Finder: `https://finder.terraclassic.community/columbus-5`.

## Invariants (must hold)

1. **Denominator** = UST1 CW20 `token_info.total_supply` only. Never USTR. Never window volume.
2. **∞ only if** UST1 `token_info` succeeded **and** `total_supply === 0`. Query failure → `NaN` / UI `N/A`, **never** `∞`.
3. **Supply > 0 → compute.** Never the stub `hasUst1Issued ? 0 : Infinity`.
4. **Liability unit:** 1 UST1 = $1. `CR% = (priced assets USD / whole UST1) * 100`.
5. **No wrap double-count:** raw cLUNC/cUSTC are supply cards only — not tokenlist holdings, not CR assets. Native LUNC/USTC already count. Allowlisted LP wrap **legs** are display-only (haircut from `crUsd`) — see [frontend-treasury-lp-nav](../frontend-treasury-lp-nav/SKILL.md).
6. **UST1 is not a raw asset.** Do not add it to the spot holdings loop. An allowlisted LP’s UST1 **leg** is CR-eligible at $1 (nets against circulating supply).
7. **Incomplete prices:** omit unpriced balances; flag incomplete; never treat missing USD as $0 or $1. Label included symbols.
8. **Decimals:** split bigint before `Number` ([decimals.ts](../../frontend/src/utils/decimals.ts)). UST1/cLUNC/cUSTC 6dp; USTR backing still 18-vs-6.
9. **Minted/burned:** CW20 has no lifetime counters. `minted = supply`, `burned = 0` with UI disclaimer. Do not scan LCD txs / `all_accounts`.
10. **getTokenInfoStrict:** do not use `getTokenInfo` for UST1 (it swallows errors as supply `0` → fake ∞).
11. **Color tiers** (if touching RatiosCard): ECONOMICS RED `<95`, YELLOW `95–110`, GREEN `110–190`, BLUE `>190` — not the old 50/100 bands.

## Tests

```bash
cd frontend && npm test
```

Fixture: 1,000,000 UST1 + $2,000,000 assets → 200% CR / 2.00x A/L.
