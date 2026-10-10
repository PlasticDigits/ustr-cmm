# Direct wrapper floors for DEX #1459

Cross-links: [DEX issue](https://git.cl8y.com/code/cl8y-dex-terraclassic/issues/1459),
[agent invariants](../../../skills/direct-wrapper-floors/SKILL.md),
[asymmetric fees](../../../skills/wrap-mapper-asymmetric-fees/SKILL.md),
[DEX checklist](https://git.cl8y.com/code/cl8y-dex-terraclassic/src/branch/fix/issue-1459-quote-semantics/docs/qa/issue-1459/README.md)
and [DEX agent invariants](https://git.cl8y.com/code/cl8y-dex-terraclassic/src/branch/fix/issue-1459-quote-semantics/skills/AGENTS_LOCAL_QUOTE_COVERAGE.md).

Treasury 0.3.0 and mapper 0.4.0 introduce an additive protected protocol:

```json
{"wrap_deposit_with_minimum":{"minimum_receive":"995000"}}
{"notify_deposit_with_minimum":{"depositor":"...","denom":"uluna","amount":"1000000","minimum_receive":"995000"}}
{"unwrap_with_minimum":{"recipient":null,"minimum_receive":"497500"}}
```

The first message receives exactly one native coin; the treasury forwards the
floor in its authenticated mapper notification. The unwrap message is a CW20
Send hook. A null recipient means the original CW20 sender. Uint128 floors are
strings and must be positive. Legacy messages retain their previous behavior.
Each contract answers `{"execution_capabilities":{}}` with
`{"direct_wrapper_floor_version":1}`. Old contracts reject the distinct variants;
clients must not attach an ignored extra field to a legacy message.

Mapper settlement snapshots the recipient's actual token/native balance before
mint or withdrawal, dispatches the last action with a success reply, and requires
`balance_after - balance_before >= minimum_receive`. Native output therefore
includes actual chain bank deductions. Fees remain independent and unwrap still
burns the gross CW20 input, preserving native backing. Reentrant execute calls
fail during settlement. A failed floor or balance query aborts the transaction,
rolling back deposits, sends, burns, mint supply, withdrawals and rate usage.
The pending settlement item is new isolated storage; existing config migrations
remain compatible and no in-flight state survives an atomic failed transaction.

DEX clients enable direct signing only after scheduled capability observation
from the expected bound mapper (and treasury for wrap). Quote handlers do not
query the chain. Legacy deployments retain useful explicitly nonexecutable
arithmetic. Source implementation and tests do not establish deployed support.

## Agent verification

1. Initialize `contracts/external/cw20-mintable` with `git submodule update --init contracts/external/cw20-mintable`.
2. Run `cargo test --locked --manifest-path contracts/Cargo.toml -p treasury -p wrap-mapper --no-default-features`.
3. Inspect the `direct_wrap_floor_failure_*` and `direct_unwrap_floor_failure_*`
   tests: compare all before/after wallet, treasury, supply and rate values;
   failed floors must leave snapshots unchanged and a corrected retry must pass.
4. Inspect `actual_native_delta_after_tax_*`: nominal output 9800 with actual
   delta 9653 cannot satisfy 9654, despite large existing recipient inventory.
5. Check exact Rust/client JSON serialization, zero floors, changed fee and
   recipient handling. Review lock lifetime through downstream callbacks.
6. On a disposable TerraClassic chain, deploy both versions, observe both
   capability queries, and repeat protected wrap/unwrap under actual bank tax.
   Measure gas for the additional two balance reads/reply before rollout.
7. Review DEX scheduled capability admission and wallet-floor serialization;
   old capabilities must remain blocked, with no quote-triggered provider calls.
8. Record revision, UTC time, commands, counts and any unavailable scope.

- [x] Treasury + mapper unit/integration corpus: 146 + 113 PASS on 2026-10-10,
  including legacy compatibility, rollback snapshots and corrected retries.
- [x] Source after-tax delta test, positive floor and exact wire JSON checks.
- [x] Isolated LocalTerra actual nonzero bank-tax execution, actual-net floor
  retry and protected gas measurement; [upstream-token receipt](localterra-receipt.json)
  and [DEX-token receipt](localterra-dex-token-receipt.json).
- [ ] Production migration, capability readback and deployed DEX acceptance.

An agent unable to complete a check may mark it **SKIP** with a concrete reason
and use overall **PASS WITH SKIPS** when all executed checks pass. Leave skipped
acceptance unchecked. Executed failures remain **FAIL**; a skip never removes
runtime floor enforcement or establishes production deployment.


## Reproduce protected wasm/chain checks

Use the repository's compatible contract toolchain and compile library targets:

```sh
cargo +1.83.0 build --locked --manifest-path contracts/Cargo.toml \
  -p treasury -p wrap-mapper --lib --release --target wasm32-unknown-unknown
```

The upstream CW20 submodule's schema binary is unrelated to contract library
artifacts; compiling `--lib` avoids that binary's existing missing QueryResponses
implementation. The DEX [isolated driver](https://git.cl8y.com/code/cl8y-dex-terraclassic/src/branch/fix/issue-1459-quote-semantics/scripts/qa/localterra-wrapper-floors-1459.py)
accepts `--container`, `--artifacts`, `--cw20-artifact`, `--receipt` and optional
`--env-file`/`--code-cache`. It refuses non-LocalTerra networks, creates fresh
keys/contracts, checks floor-specific failed receipts, verifies rollback,
requires exact actual recipient net delivery, and compares gas with the DEX's
protected offline budgets (wrap 800k, unwrap 1.2M). Transaction ante fees are
still paid on execution failure; rollback snapshots exclude the payer fee-denom
balance while covering native custody, token balance/supply and rate usage.


## Measured isolated chain evidence

On 2026-10-10, treasury code 79 / mapper code 80 (Rust 1.83 release library
artifacts without wasm-opt) passed protected wrapping and unwrapping using both
upstream-token code 81 and DEX-token code 82 in isolated synthetic contracts.
Capabilities returned version 1. Each receipt includes actual code SHA256,
transaction heights/hashes/gas and the executed driver/helper fingerprints.
The driver gained metadata-only provenance fields after the recorded run;
receipts identify the executed earlier fingerprint explicitly.

| Check | Upstream-token fixture | DEX-token fixture |
| --- | --- | --- |
| Protected wrap gas | 459,434 | 459,431 |
| Protected unwrap gas | 500,257 | 500,258 |
| Exact actual-net unwrap gas | Checked by actual-net retry | 500,607 |
| Nominal native output | 497,500 | 497,500 |
| Actual recipient native delta | 495,013 | 495,013 |
| Failed floor rollback + exact-net retry | PASS | PASS |

The bank deduction was nonzero (2,487 atomics). A floor one above the actual
recipient delta reverted; the exact actual delta passed. Custody, CW20 balance,
supply, recipient and rate snapshots were unchanged after rejected floors.
The old wrap envelope 400k is below measured protected wrap usage; DEX protected
source budgets are 800k wrap / 1.2M unwrap. These isolated measurements do not
establish production gas bounds, release-optimized artifact attestations,
production migration or deployed browser acceptance.
