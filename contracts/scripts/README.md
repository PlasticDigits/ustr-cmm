# USTR CMM Deployment Scripts

This directory contains scripts and configuration for deploying USTR CMM contracts to TerraClassic.

## Prerequisites

1. **Install terrad CLI**: Follow the [TerraClassic documentation](https://docs.terra-classic.io)

2. **Configure wallet**:
   ```bash
   terrad keys add mykey --recover  # Import existing wallet
   # or
   terrad keys add mykey            # Create new wallet
   ```

3. **Fund wallet**: Ensure your wallet has sufficient LUNC for gas fees

4. **Build contracts**:
   ```bash
   cd ../
   cargo build --release --target wasm32-unknown-unknown
   
   # Optimize for deployment (requires docker)
   docker run --rm -v "$(pwd)":/code \
     --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
     --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
     cosmwasm/optimizer:0.15.0
   ```

## Files

- `deploy.sh` - Main deployment script
- `instantiate.json` - Example instantiate messages for reference
- `README.md` - This file

## Deployment

### Testnet Deployment

```bash
./deploy.sh testnet mykey
```

This will:
1. Store all contract WASM files
2. Instantiate contracts in the correct order
3. Configure USTC Swap as a minter for USTR Token
4. Save deployment info to a JSON file

### Mainnet Deployment

```bash
./deploy.sh mainnet mykey
```

**WARNING**: Mainnet deployment will prompt for confirmation. Double-check all parameters before confirming.

## Deployment Order

Contracts must be deployed in this order due to dependencies:

1. **USTR Token** - No dependencies
2. **Treasury** - No dependencies
3. **Airdrop** - No dependencies
4. **USTC Swap** - Requires USTR Token and Treasury addresses

## Post-Deployment Steps

After deployment:

1. **Add USTC Swap as minter** (done automatically by deploy.sh):
   ```bash
   terrad tx wasm execute <USTR_TOKEN_ADDR> \
     '{"add_minter":{"minter":"<USTC_SWAP_ADDR>"}}' \
     --from mykey --chain-id columbus-5 --gas auto --gas-adjustment 1.4
   ```

2. **Transfer preregistration USTC to Treasury**:
   - Set treasury address on preregistration contract
   - Wait 7 days for timelock
   - Execute transfer

3. **Airdrop USTR to preregistration participants**:
   - Approve airdrop contract to spend USTR
   - Execute airdrop with participant list

4. **Verify contracts**:
   ```bash
   terrad query wasm contract <CONTRACT_ADDR> --node <RPC>
   terrad query wasm contract-state smart <CONTRACT_ADDR> '{"config":{}}' --node <RPC>
   ```

## Network Configuration

### Testnet (rebel-2)
- RPC: `https://terra-classic-testnet-rpc.publicnode.com`
- Chain ID: `rebel-2`

### Mainnet (columbus-5)
- RPC: `https://terra-classic-rpc.publicnode.com`
- Chain ID: `columbus-5`

## Troubleshooting

### "out of gas" errors
Increase `--gas-adjustment` to 1.5 or higher

### Transaction not found
Wait longer between transactions (increase sleep time in deploy.sh)

### Invalid address format
Ensure all addresses use the `terra1...` format for TerraClassic

## Security Checklist

Before mainnet deployment:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Testnet deployment successful
- [ ] Contract code reviewed
- [ ] External audit completed (if applicable)
- [ ] Instantiate parameters verified
- [ ] Wallet addresses double-checked
- [ ] Start time set correctly
- [ ] Backup of deployment keys secured

