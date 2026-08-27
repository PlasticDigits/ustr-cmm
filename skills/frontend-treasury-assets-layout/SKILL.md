---
name: frontend-treasury-assets-layout
description: >-
  Tablet-safe Treasury Assets grid and tile layout (GitLab #21). Use when
  changing TreasuryAssetsCard breakpoints, tile flex, amount/USD/CR copy, or
  treasuryAssetDisplay helpers. Display-only — do not retouch CR/NAV math.
---

# Frontend Treasury Assets tablet layout (#21)

Companion: [#21](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/21). LP rows / NAV / haircut **meaning**: [#14](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/14), [#16](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/16) / [frontend-treasury-lp-nav](../frontend-treasury-lp-nav/SKILL.md) / [frontend-treasury-available-supply](../frontend-treasury-available-supply/SKILL.md). Future long label `#20` (`CL8Y/cUSTC`) must still fit this grid.

Cross-links: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [docs/CONTRACTS.md](../../docs/CONTRACTS.md), [frontend/src/components/treasury/TreasuryAssetsCard.tsx](../../frontend/src/components/treasury/TreasuryAssetsCard.tsx), [frontend/src/utils/treasuryAssetDisplay.ts](../../frontend/src/utils/treasuryAssetDisplay.ts), [frontend/src/utils/format.ts](../../frontend/src/utils/format.ts).

## Why this exists

At Tailwind `lg` (1024 CSS px) a 3-column grid plus a single-row tile (`flex-shrink-0` label + `truncate` values) clips pool share, large spot amounts, and CR haircut lines. iPad has no hover, so `title` cannot recover the text. Clipped `100% of …` or `CR counts $0.00…` is an integrity bug, not just polish.

## Pins (do not invent)

Layout only. Pair names stay from tokenlist `pool.name` / `name` / `symbol` via `treasuryLp` → `useTreasury`. Do not hardcode `LP UST1/SpaceUSD` (or any production label) in the card.

Scanner links stay `NETWORKS[DEFAULT_NETWORK].scanner` + `/address/{treasury|explorerAddress}`.

## Invariants (must hold)

1. **Display-only.** Do not change `computeTreasuryRatios`, `computeLpNav`, available-supply, haircut eligibility, skip-lists, dust (`shouldShowAsset`), or contract queries.
2. **Breakpoints:** `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`. **No** `lg:grid-cols-3`. 1024px is two columns. Shared class: `TREASURY_ASSETS_GRID_CLASS` (loaded grid **and** skeleton).
3. **No ellipsis** on primary amount, USD, or CR / haircut / `NAV incomplete`. Wrap (`break-words`). Do not ship tooltip-only, `scale`, or a horizontal scroller inside a tile.
4. **CR disclosure stays visible.** Copy may be shorter (`CR $0.00 · cUSTC omitted`) but every omitted leg and an explicit $0 CR must remain. React text nodes only — tokenlist strings are untrusted length.
5. **`formatPoolShare` rounding is unchanged** (`≥ 0.99995` → `100% of pool`; non-finite / negative → `—`). Card-only spot display decimals (`formatTreasuryCardAmount`) must not feed CR.
6. **Keep** empty state, rank badges on the icon, View Contract, Pair explorer links, `NAV incomplete`, vFDUSD `· session oracle`. Playwright hooks: `treasury-assets`, `treasury-asset-{displayName}`, `treasury-assets-grid`.
7. **No page X-scroll** that hides header CTAs or View Contract. Tablet body ≥ existing `text-sm` / `text-xs` CR line.
8. **Tolerate `#20`:** a longer `pairLabel` such as `LP CL8Y/cUSTC` plus a haircut line must wrap inside the tile, not overflow.

## Tests

```bash
cd frontend && npm test && npm run check && npm run test:e2e
```

Fixtures: grid class has `xl:grid-cols-3` and not `lg:grid-cols-3`; `formatTreasuryCrHaircut(0, ['cUSTC'])` → `CR $0.00 · cUSTC omitted`; `formatPoolShare(0.99995)` still `100% of pool`; `formatPoolShare(0.99994)` stays `99.99% of pool`.

Visual / e2e: `/treasury` at 375 / 768 / 834 / 1024 / 1280 — two columns at 1024, no ellipsis on USTC/LUNC + current LP rows (`frontend/e2e/treasury-assets-layout.spec.ts`, Playwright `--workers=5`).
