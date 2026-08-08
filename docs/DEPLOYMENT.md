# USTR CMM Deployment Guide

> **📖 Official Documentation**: For TerraClassic network documentation, see [docs.terra-classic.io](https://docs.terra-classic.io).

This document outlines the deployment procedures for USTR CMM contracts on TerraClassic.

## Prerequisites

### Development Environment

1. **Rust** 1.44.1+ with wasm32 target:
   ```bash
   rustup target add wasm32-unknown-unknown
   ```

2. **Docker** (recommended for optimized builds):
   ```bash
   docker --version
   ```

3. **TerraClassic CLI** (terrad):
   ```bash
   # Install terrad or use container
   docker pull terramoney/core:latest
   ```

4. **Funded Wallet** with sufficient LUNC for gas fees

### Network Configuration

**Testnet (rebel-2)**
```bash
export CHAIN_ID="rebel-2"
export RPC="https://terra-classic-testnet-rpc.publicnode.com:443"
export LCD="https://terra-classic-testnet-lcd.publicnode.com"
export CW20_CODE_ID="1641"
```

**Mainnet (columbus-5)**
```bash
export CHAIN_ID="columbus-5"
export RPC="https://terra-classic-rpc.publicnode.com:443"
export LCD="https://terra-classic-lcd.publicnode.com"
export CW20_CODE_ID="10184"
```

## Build Contracts

### Using Docker (Recommended)

```bash
cd contracts

# Build all contracts
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.16.0

# Artifacts will be in ./artifacts/
ls -la artifacts/
```

### Without Docker

```bash
cd contracts

# Build each contract
RUSTFLAGS='-C link-arg=-s' cargo build --release --target wasm32-unknown-unknown

# Optimize (requires wasm-opt)
wasm-opt -Oz -o treasury_optimized.wasm target/wasm32-unknown-unknown/release/treasury.wasm
```

## Deployment Order

The contracts must be deployed in this order due to dependencies:

1. **USTR Token** (no dependencies)
2. **Treasury** (no dependencies)
3. **USTC-Swap** (depends on USTR Token and Treasury)

## Step 1: Deploy USTR Token

### Option A: Use Existing Code ID

The cw20-mintable contract is already deployed on TerraClassic:
- Mainnet: Code ID `10184`
- Testnet: Code ID `1641`

### Instantiate USTR Token

Create `ustr_init.json`:
```json
{
  "name": "USTR",
  "symbol": "USTR",
  "decimals": 6,
  "initial_balances": [],
  "mint": {
    "minter": "terra1youraddress...",
    "cap": null
  },
  "marketing": {
    "project": "USTR CMM",
    "description": "USTR utility token for the collateralized stablecoin system",
    "marketing": null,
    "logo": null
  }
}
```

```bash
terrad tx wasm instantiate $CW20_CODE_ID \
  "$(cat ustr_init.json)" \
  --from wallet \
  --label "USTR Token" \
  --admin "terra1youraddress..." \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 500000000uluna \
  --broadcast-mode sync \
  -y

# Save the contract address
export USTR_TOKEN="terra1..."
```

## Step 2: Deploy Treasury Contract

### Store Treasury Contract

```bash
terrad tx wasm store artifacts/treasury.wasm \
  --from wallet \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 100000000uluna \
  --broadcast-mode sync \
  -y

# Get the code ID from transaction result
export TREASURY_CODE_ID="..."
```

### Instantiate Treasury

Create `treasury_init.json`:
```json
{
  "governance": "terra1youradminwallet..."
}
```

```bash
terrad tx wasm instantiate $TREASURY_CODE_ID \
  "$(cat treasury_init.json)" \
  --from wallet \
  --label "USTR CMM Treasury" \
  --admin "terra1youradminwallet..." \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 500000000uluna \
  --broadcast-mode sync \
  -y

# Save the contract address
export TREASURY="terra1..."
```

## Step 3: Deploy USTC-Swap Contract

### Store Swap Contract

```bash
terrad tx wasm store artifacts/ustc_swap.wasm \
  --from wallet \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 100000000uluna \
  --broadcast-mode sync \
  -y

# Get the code ID from transaction result
export SWAP_CODE_ID="..."
```

### Instantiate Swap Contract

Create `swap_init.json`:
```json
{
  "ustr_token": "terra1...",
  "treasury": "terra1...",
  "start_time": 1234567890,
  "start_rate": "1.5",
  "end_rate": "2.5",
  "duration_seconds": 8640000,
  "admin": "terra1youradminwallet..."
}
```

**Note**: `start_time` is a Unix epoch timestamp (seconds). Set this to the desired swap start time. You can get the current timestamp with `date +%s`.

```bash
terrad tx wasm instantiate $SWAP_CODE_ID \
  "$(cat swap_init.json)" \
  --from wallet \
  --label "USTC to USTR Swap" \
  --admin "terra1youradminwallet..." \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 500000000uluna \
  --broadcast-mode sync \
  -y

# Save the contract address
export SWAP="terra1..."
```

## Step 4: Configure Minter Permissions

### Add Swap Contract as USTR Minter

```bash
terrad tx wasm execute $USTR_TOKEN \
  '{"add_minter": {"minter": "'"$SWAP"'"}}' \
  --from wallet \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 100000000uluna \
  --broadcast-mode sync \
  -y
```

### Remove Deployer from Minters (Optional but Recommended)

```bash
terrad tx wasm execute $USTR_TOKEN \
  '{"remove_minter": {"minter": "terra1youraddress..."}}' \
  --from wallet \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 100000000uluna \
  --broadcast-mode sync \
  -y
```

### Swap Wiring (No Treasury Step)

`set_swap_contract` was removed in [#8](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/8). No treasury wiring is needed for swap — instantiate ustc-swap with the treasury address in `swap_init.json`. Users call `Swap` on ustc-swap; it forwards USTC to treasury via `BankMsg::Send`. See [skills/treasury-swap-removal](../skills/treasury-swap-removal/SKILL.md).

## Step 5: Transfer Initial USTC to Treasury

**Note on USTC Burn Tax**: TerraClassic applies a burn tax on `uusd` transfers. Per the [official documentation](https://docs.terra-classic.io), `ComputeTax()` multiplies each spend coin by `BurnTaxRate` and truncates to integers. The treasury will receive the post-tax amount.

```bash
# Transfer USTC to treasury (burn tax will be applied)
terrad tx bank send wallet $TREASURY <AMOUNT>uusd \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 100000000uluna \
  --broadcast-mode sync \
  -y

# Note: Replace <AMOUNT> with actual preregistration amount
# The treasury receives post-tax amount which is accounted for in CR calculations
```

## Verification

### Verify USTR Token

```bash
# Query token info
terrad query wasm contract-state smart $USTR_TOKEN '{"token_info": {}}' \
  --node $RPC

# Query minters
terrad query wasm contract-state smart $USTR_TOKEN '{"minters": {}}' \
  --node $RPC
```

### Verify Treasury

```bash
# Query config
terrad query wasm contract-state smart $TREASURY '{"config": {}}' \
  --node $RPC

# Query USTC balance
terrad query bank balances $TREASURY --node $RPC
```

### Verify Swap Contract

```bash
# Query config
terrad query wasm contract-state smart $SWAP '{"config": {}}' \
  --node $RPC

# Query current rate
terrad query wasm contract-state smart $SWAP '{"current_rate": {}}' \
  --node $RPC

# Query status
terrad query wasm contract-state smart $SWAP '{"status": {}}' \
  --node $RPC
```

## Treasury Migrate + Wrap Wiring + CW20 Spender (#5 / #6 / #7 / #8)

In-place migrate keeps mainnet treasury address
`terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2` stable.

**Mainnet status (2026-08-08):** treasury migrated `10673` → **`11564`**; wrap-mapper code **`11565`** live; cLUNC/cUSTC + denom wiring complete; vFDUSD → ust1-window spender registered with `limit_24h=10000000000`. See [Contract Addresses](#contract-addresses) and issue [#5](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/5).

**One-shot operator script** (steps A+B+C): [`contracts/scripts/treasury-migrate-wrap-wire.sh`](../contracts/scripts/treasury-migrate-wrap-wire.sh) — signs as `cl8y2_admin` (`terra1xsecn…`). Prefer `--gas auto --gas-prices 28.325uluna` (store adj **1.5**, execute/migrate adj **1.4**). Fixed `--fees 100000000uluna` is **insufficient for wasm store** (~covers ≤3.53M gas; treasury store sim was ~3.30M raw / ~4.95M with 1.5 adj ≈ **140 LUNC**).

**Fail-closed (#7):** InstantWithdrawCw20 requires a configured 24h pull limit for `(token, spender)`. Set the limit **with** or **before** enabling window redeem.

```bash
# Preferred: full A+B+C
cd contracts/scripts
./treasury-migrate-wrap-wire.sh --dry-run   # gas check
./treasury-migrate-wrap-wire.sh             # mainnet (prompts)

# Manual migrate-only (governance/admin = cl8y2_admin)
terrad tx wasm migrate $TREASURY $NEW_TREASURY_CODE_ID '{}' \
  --from cl8y2_admin \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto --gas-adjustment 1.4 \
  --gas-prices 28.325uluna \
  --broadcast-mode sync -y

# Verify post-migrate
terrad query wasm contract-state smart $TREASURY '{"config":{}}' --node $RPC
# expect wrapping_paused + cw20_instant_withdraw_paused; no swap_contract field (#8)
terrad query wasm contract-state smart $TREASURY '{"denom_wrappers":{}}' --node $RPC
terrad query wasm contract-state smart $TREASURY '{"cw20_spenders":{}}' --node $RPC

# Register spender WITH 24h limit (align with window inventory policy)
terrad tx wasm execute $TREASURY \
  "{\"set_cw20_spender\":{\"token\":\"$TERRA_VFDUSD\",\"spender\":\"$WINDOW_ADDR\",\"limit_24h\":\"$VFDUSD_PULL_LIMIT_24H\"}}" \
  --from cl8y2_admin \
  --chain-id $CHAIN_ID --node $RPC \
  --gas auto --gas-adjustment 1.4 \
  --gas-prices 28.325uluna \
  --broadcast-mode sync -y

terrad query wasm contract-state smart $TREASURY \
  "{\"cw20_spender_limit\":{\"token\":\"$TERRA_VFDUSD\",\"spender\":\"$WINDOW_ADDR\"}}" \
  --node $RPC
```

To change quota later without rotating the spender:

```bash
terrad tx wasm execute $TREASURY \
  "{\"set_cw20_spender_limit\":{\"token\":\"$TERRA_VFDUSD\",\"spender\":\"$WINDOW_ADDR\",\"limit_24h\":\"$VFDUSD_PULL_LIMIT_24H\"}}" \
  --from cl8y2_admin \
  --chain-id $CHAIN_ID --node $RPC \
  --gas auto --gas-adjustment 1.4 \
  --gas-prices 28.325uluna \
  --broadcast-mode sync -y
```

**Pause semantics**: `set_wrapping_paused` does **not** stop CW20 InstantWithdraw.
Use `set_cw20_instant_withdraw_paused` to halt window vFDUSD pulls independently.
`cw20_iw_paused` does **not** stop governance `ExecuteWithdraw`.

Agent/operator playbook: [skills/treasury-cw20-instant-withdraw](../skills/treasury-cw20-instant-withdraw/SKILL.md).

## Post-Deployment Checklist

- [x] USTR token instantiated correctly
- [x] Treasury contract deployed with correct governance
- [x] Swap contract deployed with correct configuration
- [x] Swap contract added as USTR minter
- [ ] Deployer removed from USTR minters
- [x] Treasury migrate strips `swap_contract` ([#8](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/8); no `set_swap_contract` step) — done 2026-08-08 code `11564`
- [x] Initial USTC transferred to treasury
- [x] All contract addresses documented
- [ ] Frontend updated with contract addresses (Phase 4 — wrap mapper / cLUNC / cUSTC)
- [ ] Monitoring/alerting configured
- [x] Treasury migrated with CW20 InstantWithdraw API (#6) + 24h pull limits (#7)
- [x] `SetCw20Spender` (+ `limit_24h`) executed for vFDUSD → ust1-window (`10000000000`)
- [x] `Cw20SpenderLimit` query confirms production quota
- [x] wrap-mapper + cLUNC/cUSTC denom wiring (#5)
- [ ] Small mainnet wrap/unwrap smoke both denoms
- [ ] Window redeem smoke after companion ready

## Contract Addresses

### Testnet (rebel-2)

| Contract | Address |
|----------|---------|
| USTR Token | `terra1...` |
| Treasury | `terra1...` |
| USTC-Swap | `terra1...` |

### Mainnet (columbus-5)

| Contract | Code ID | Address |
|----------|---------|---------|
| USTR Token | `10184` | `terra1vy3kc0swag2rhn7jz6n72jp0l2ns0p6r6ez5grxq5uhj2rvs97fqfsetxv` |
| Treasury | `11564` (was `10673`) | `terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2` |
| wrap-mapper | `11565` | `terra1xuuuhpmyd5t29ry7mydg7ra2q2phrwhx7j28nx7x9sjw6zznkumsz0nmd2` |
| cLUNC | `10184` | `terra1437qslye72t7qmmahn4t5chz50r8a62g45phwkquwpyu2l62u6ksqssgdg` |
| cUSTC | `10184` | `terra1nap4dxh9tv35v0ynd9m4k6zt6c0dq6weszc4j5m564kjls56hu7qcr56ch` |
| USTC-Swap | `10838` | `terra16ytnkhw53elefz2rhulcr4vq8fs83nd97ht3wt05wtcq7ypcmpqqv37lel` |
| Referral | `10700` | `terra1lxv5m2n72l4zujf0rrgek9k6m8kfky62yvm8qvlnjqgjmmlmywzqt4j0z2` |
| Airdrop | `10700` | `terra1m758wqc6grg7ttg8cmrp72hf6a5cej5zq0w59d9d6wr5r22tulwqk3ga5r` |

**Wrap / spender wiring (mainnet):**

| Binding | Value |
|---------|-------|
| Admin / governance (`cl8y2_admin`) | `terra1xsecn4snv94ezcez0z3vq8an9j4h4kxxcydp8l` |
| wrap-mapper `fee_bps` | **`200` (2%)** — see [Wrap fee vs burn tax](#wrap-fee-vs-burn-tax) |
| Per-denom rate limits | **unset** (fail-open until `SetRateLimit`) |
| `uluna` → cLUNC → wrap-mapper | wired |
| `uusd` → cUSTC → wrap-mapper | wired |
| CW20 spender | vFDUSD `terra1mnl9…svj3` → ust1-window `terra1zxwpz…h3rh2` |
| `limit_24h` | `10000000000` (10_000 vFDUSD, 6 decimals) |

Artifact record: [`contracts/scripts/treasury-migrate-wrap-20260808-090524.json`](../contracts/scripts/treasury-migrate-wrap-20260808-090524.json).

### Wrap fee vs burn tax

Unwrap calls treasury `InstantWithdraw` → `BankMsg::Send`, which pays Terra Classic burn tax. Wrap-mapper skims `fee_bps` on **both** wrap and unwrap; the fee residual stays in treasury and must cover that tax or native backing erodes vs outstanding CW20.

| Date | Event | Wrap `fee_bps` | Chain burn tax |
|------|--------|----------------|----------------|
| 2026-08-08 | Phase 3 instantiate | `100` (1%) | was 0.5% |
| 2026-08-08 | [Prop #12223](https://station.terraclassic.community/proposal/columbus-5/12223) **passed** | — | **1.5%** (`0.015`) |
| 2026-08-08 | Gov `SetFeeBps` | **`200` (2%)** | 1.5% |

**Policy:** keep ~**0.5% above** on-chain tax (same cushion as 1% fee under 0.5% tax). Chose **2%** over 3% (2× tax) to avoid unnecessary round-trip friction. Governance:

```bash
terrad tx wasm execute $WRAP_MAPPER '{"set_fee_bps":{"fee_bps":200}}' \
  --from cl8y2_admin --chain-id columbus-5 --node $RPC \
  --gas auto --gas-adjustment 1.4 --gas-prices 28.325uluna -y
```

## Troubleshooting

### Common Issues

1. **Insufficient Gas**
   - Prefer `--gas auto --gas-prices 28.325uluna` (not fixed `--fees 100000000uluna` for wasm store)
   - Increase `--gas-adjustment` to 1.5+ for store; 1.4 is usually enough for migrate/execute

2. **Contract Not Found**
   - Verify code ID is correct for the network
   - Wait for transaction confirmation before querying

3. **Unauthorized**
   - Verify you're using the correct wallet
   - Check contract admin/governance settings

4. **Minter Already Exists**
   - The address is already a minter; skip this step

### Getting Help

- Check transaction on explorer: https://finder.terraclassic.community/
- Review contract error messages in transaction details
- Verify wallet has sufficient LUNC for gas

