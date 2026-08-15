---
name: frontend-vfdusd-oracle
description: >-
  Session-once ust1-oracle USD for treasury vFDUSD (GitLab #10). Use when
  changing vFDUSD tokenlist metadata, CONTRACTS.vfdusd / ust1Oracle, price.ts
  oracle query, usePrices DEX skip, or sessionStorage cache validation.
---

# Frontend vFDUSD session-once oracle (#10)

Companion: [#10](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/10). Liability/CR consumer: [#11](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/11) / [frontend-ust1-ratios](../frontend-ust1-ratios/SKILL.md). Window inventory: [treasury-cw20-instant-withdraw](../treasury-cw20-instant-withdraw/SKILL.md).

Cross-links: [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [frontend/src/utils/vfdusdOracle.ts](../../frontend/src/utils/vfdusdOracle.ts), [frontend/src/services/price.ts](../../frontend/src/services/price.ts).

## Why this exists

Treasury already custodies bridged vFDUSD for ust1-window redeem. The public Treasury page must show a USD line from **ust1-oracle** `rate / 1e18` (FDUSD per vFDUSD × $1). vFDUSD is **not** a Terra AMM pair — putting it in the Binance/DEX 60s loop burns LCD quota and returns null.

## Pins (do not invent)

| Name | Address |
|------|---------|
| vFDUSD | `terra1mnl9azefrqpmu888ar2u6zrcwr80hxlt3avf4300r576cw5ar7esvxsvj3` |
| ust1-oracle | `terra1fmht0t6svq3n24zx03nkfja0m40zhfyyxkdcvlrkl6u7gfe6aagq4gch8n` |

On-chain query: `{"state":{}}`. Live field is **`rate`** (issue text says `R` — parser accepts both). `paused: true` → no USD.

## Invariants (must hold)

1. **Session-once**: at most one oracle LCD attempt per tab session after success **or** recorded hard failure (`sessionStorage` key `ustr-cmm:vfdusd-oracle:v1`). No refetch on treasury 30s, price 60s, or window focus.
2. **In-flight dedupe**: concurrent mounts share one Promise.
3. **No DEX / no BSC**: skip vFDUSD by symbol **and** address even if `pool` is added. Zero BSC URLs in the frontend.
4. **No $1 fallback**: invalid / paused / network fail → omit USD, never assume 1.0 per vFDUSD.
5. **Sanity band**: `0.5 … 10` FDUSD per vFDUSD. Re-validate on every sessionStorage read (tamper / wrong schema → miss).
6. **Decimal hygiene**: split `rate / 1e18` before JS number (`Number(1.22e18)` is not safe-integer).
7. **LCD hygiene**: `LCD_CONFIG.minRequestInterval`, endpoint cooldown, fallbacks. 429 marks unhealthy; no tight retry.
8. **Rank**: vFDUSD is real collateral — include in USD sort/rank (unlike USTC). Dust hide still applies when priced.

## Tests

```bash
cd frontend && npm test
```

Covers rate parse, paused/invalid, session schema, DEX skip helper.
