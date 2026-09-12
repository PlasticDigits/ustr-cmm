---
name: treasury-migrate-owned
description: >-
  Governance MigrateOwnedContract so CMM can WasmMsg::Migrate CW20s it wasm-admins
  (ALPHA 11630→11666). Use when changing that execute, treasury 0.2.2 cw2, or
  columbus-5 CMM-then-token migrate ops (ustr-cmm #43).
---

# Treasury migrate owned contracts (#43)

DEX 2-of-3 is **CMM wasm admin** and `Config.governance`. It is **not** ALPHA’s wasm admin. `terrad tx wasm migrate ALPHA` is Unauthorized until CMM emits `WasmMsg::Migrate`.

## API

| Msg | Who | Notes |
|-----|-----|-------|
| `MigrateOwnedContract { contract, new_code_id, msg? }` | `Config.governance` | No 7-day withdraw timelock. `new_code_id == 0` rejected. LCD `ContractInfo.admin` must equal this treasury. Omit `msg` / empty → `{}`. |

InstantWithdrawCw20 still must not emit arbitrary wasm.

## Ops (columbus-5)

1. Optimizer `artifacts/treasury.wasm` (not `cargo wasm`).
2. Store (`cl8ydeploy`) → treasury code id `T`.
3. 2-of-3: `wasm migrate $TREASURY T '{}'` → cw2 `crates.io:treasury` **0.2.2**.
4. 2-of-3 execute `migrate_owned_contract` on ALPHA → **11666**.
5. LCD ALPHA `code_id=11666` / cw2 1.1.0, then DEX Refresh ([#1250](https://git.cl8y.com/code/cl8y-dex-terraclassic/issues/1250)). Keep **11630** listed until Refresh.

```bash
cd /home/answorld/repos/cl8y-dex-terraclassic
./scripts/multisig-2of3-host-tx.sh wasm migrate \
  terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2 T '{}'
./scripts/multisig-2of3-host-tx.sh wasm execute \
  terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2 \
  '{"migrate_owned_contract":{"contract":"terra1x6e64es6yhauhvs3prvpdg2gkqdtfru840wgnhs935x8axr7zxkqzysuxz","new_code_id":11666}}'
```

## Tests

```bash
cd contracts && cargo test --package treasury --lib migrate_owned
```
