---
name: direct-wrapper-floors
description: Use when changing direct native wrapping settlement, minimum receive guarantees, wrapper capabilities, or DEX zero-hop integration.
---

# Direct wrapper receive floors (DEX #1459)

Consumer: [DEX #1459](https://git.cl8y.com/code/cl8y-dex-terraclassic/issues/1459).
Read the [protocol and agent checklist](../../docs/qa/dex-1459/README.md).

| Invariant | Required behavior |
| --- | --- |
| WF1459-1 | Keep legacy `WrapDeposit`, `NotifyDeposit` and `Unwrap` wire messages intact. Protected execution uses distinct `*WithMinimum` variants; unknown deployments must reject them. |
| WF1459-2 | Floor-bearing messages require a positive Uint128 `minimum_receive`. Missing/zero floors never become a protected request. |
| WF1459-3 | Measure the actual recipient balance delta after the mint or treasury withdrawal completes. Existing balances never satisfy a new floor; native bank taxes are included without guessed rates or tax gross-up. |
| WF1459-4 | Hold a mapper execution lock through all mint/burn/treasury callbacks. Successful settlement removes it; any failed floor/query/downstream action reverts the complete transaction. |
| WF1459-5 | Preserve treasury registration/authentication, pause, fees, rate limits, denom mapping and native backing. Floor failures roll back native deposit/withdraw, CW20 transfer/mint/burn, supply and rate usage. |
| WF1459-6 | Advertise exact `execution_capabilities.direct_wrapper_floor_version:1`. DEX admission comes from independent scheduled queries to the bound contracts, never request-triggered RPC or package-version assumptions. |
| WF1459-7 | Wrap support requires treasury and mapper capability; unwrap requires mapper capability. Fresh arithmetic alone never establishes execution support on legacy deployments. |
| WF1459-8 | Run meaningful rollback, actual-delta, capability and serialization tests. Unavailable checks may be explicit SKIP with overall PASS WITH SKIPS if all executed checks pass. A failed assertion remains FAIL; deployment remains separate. |

Versions: treasury 0.3.0, wrap-mapper 0.4.0 add this source protocol. Existing
on-chain versions remain unsupported until their scheduled capabilities are observed.
