---
name: frontend-ust1-ratios
description: >-
  Live UST1 available supply, cLUNC/cUSTC supply, and CR from UST1 available
  (GitLab #11, revised by #16). Use when changing useTreasury ratio math,
  IssuanceCard / RatiosCard, or CONTRACTS.ust1Token / cLunc / cUstc.
---

# Frontend UST1 issuance + CR (#11, revised by #16)

Companion: [#11](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/11), revised by [#16](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/16) / [frontend-treasury-available-supply](../frontend-treasury-available-supply/SKILL.md). Numerator prices including vFDUSD: [#10](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/10) / [frontend-vfdusd-oracle](../frontend-vfdusd-oracle/SKILL.md). Protocol LP NAV: [#14](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/14) / [frontend-treasury-lp-nav](../frontend-treasury-lp-nav/SKILL.md). Live CR / CL8Y catalog: [#18](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/18) / [frontend-treasury-cl8y-holdings](../frontend-treasury-cl8y-holdings/SKILL.md). CL8Y-cb/cUSTC pin: [#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20). Economics tiers: [docs/ECONOMICS.md](../../docs/ECONOMICS.md).

Cross-links: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [frontend/src/utils/treasuryRatios.ts](../../frontend/src/utils/treasuryRatios.ts), [frontend/src/utils/availableSupply.ts](../../frontend/src/utils/availableSupply.ts), [frontend/src/hooks/useTreasury.ts](../../frontend/src/hooks/useTreasury.ts).

## Pins (do not invent)

| Name | Address | Decimals |
|------|---------|----------|
| UST1 | `terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72` | 6 |
| cLUNC | `terra1437qslye72t7qmmahn4t5chz50r8a62g45phwkquwpyu2l62u6ksqssgdg` | 6 |
| cUSTC | `terra1nap4dxh9tv35v0ynd9m4k6zt6c0dq6weszc4j5m564kjls56hu7qcr56ch` | 6 |

Finder: `https://finder.terraclassic.community/columbus-5`.

## Invariants (must hold)

1. **Denominator** = UST1 **available supply** (outstanding − CMM-owned). Never raw `total_supply` alone. Never USTR. Never window volume. See [#16](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/16).
2. **∞ only if** UST1 `token_info` **and** CMM-owned queries succeeded **and** available === 0. Query failure → hide Key Ratios, **never** `∞`.
3. **Supply > 0 → compute.** Never the stub `hasUst1Issued ? 0 : Infinity`.
4. **Liability unit:** 1 UST1 = $1 for the ratio. `CR% = (priced non-protocol USD / whole available UST1) * 100`. Do **not** put UST1 in the numerator.
5. **No wrap double-count:** raw cLUNC/cUSTC are issuance cards only — not tokenlist holdings, not CR assets. Native LUNC/USTC already count. Allowlisted LP wrap **and** UST1/USTR **legs** are display-only (out of `crUsd`).
6. **UST1 is not a raw asset and not an LP CR leg.** Do not add it to the spot holdings loop. An allowlisted LP’s UST1 leg is **not** CR-eligible (#16 supersedes the old $1-in-numerator rule).
7. **Incomplete prices:** Key Ratios shows only `prices not loaded, cannot display key ratios`. Never treat missing USD as $0 or $1. Never paint a partial GREEN/BLUE CR.
8. **Decimals:** split bigint before `Number` ([decimals.ts](../../frontend/src/utils/decimals.ts)). UST1/cLUNC/cUSTC 6dp; USTR 18.
9. **Issuance card:** `+ Outstanding` / `− CMM-owned liquidity` / **Available Supply**. Do not invent lifetime mint/burn. Do not scan LCD txs / `all_accounts`.
10. **getTokenInfoStrict / getTokenBalanceStrict:** do not use the swallowing `getTokenInfo` / `getTokenBalance` for UST1 inventory (fake 0 → fake ∞ or undercounted CMM-owned).
11. **Color tiers** (if touching RatiosCard): RED `<95`, YELLOW `[95, 110)`, GREEN `[110, 190]`, BLUE `>190` including `∞`. Copy is status display — see [frontend-treasury-available-supply](../frontend-treasury-available-supply/SKILL.md).

## Tests

```bash
cd frontend && npm test
```

Fixture: 1,000,000 **available** UST1 + $2,000,000 assets → 200% CR / 2.00x A/L / BLUE.
