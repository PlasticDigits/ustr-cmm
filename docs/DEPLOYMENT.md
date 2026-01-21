# USTR CMM Deployment Guide

> **📖 Official Documentation**: For TerraClassic network documentation, see [terra-classic.io/docs](https://terra-classic.io/docs).

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

### Set Swap Contract on Treasury

The Treasury needs to know the Swap contract address to notify it of deposits:

```bash
terrad tx wasm execute $TREASURY \
  '{"set_swap_contract": {"contract_addr": "'"$SWAP"'"}}' \
  --from wallet \
  --chain-id $CHAIN_ID \
  --node $RPC \
  --gas auto \
  --gas-adjustment 1.4 \
  --fees 100000000uluna \
  --broadcast-mode sync \
  -y
```

## Step 5: Transfer Initial USTC to Treasury

**Note on USTC Burn Tax**: TerraClassic applies a burn tax on `uusd` transfers. Per the [official documentation](https://terra-classic.io/docs/develop/module-specifications/tax), `ComputeTax()` multiplies each spend coin by `BurnTaxRate` and truncates to integers. The treasury will receive the post-tax amount.

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

## Post-Deployment Checklist

- [ ] USTR token instantiated correctly
- [ ] Treasury contract deployed with correct governance
- [ ] Swap contract deployed with correct configuration
- [ ] Swap contract added as USTR minter
- [ ] Deployer removed from USTR minters
- [ ] Swap contract set on Treasury (`set_swap_contract`)
- [ ] Initial USTC transferred to treasury
- [ ] All contract addresses documented
- [ ] Frontend updated with contract addresses
- [ ] Monitoring/alerting configured

## Contract Addresses

After deployment, update this section with actual addresses:

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
| Treasury | `10673` | `terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2` |
| USTC-Swap | `10817` | `terra16ytnkhw53elefz2rhulcr4vq8fs83nd97ht3wt05wtcq7ypcmpqqv37lel` |
| Referral | `10700` | `terra1lxv5m2n72l4zujf0rrgek9k6m8kfky62yvm8qvlnjqgjmmlmywzqt4j0z2` |
| Airdrop | `10700` | `terra1m758wqc6grg7ttg8cmrp72hf6a5cej5zq0w59d9d6wr5r22tulwqk3ga5r` |

## Troubleshooting

### Common Issues

1. **Insufficient Gas**
   - Increase `--gas-adjustment` to 1.5 or higher
   - Increase `--fees` amount

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

