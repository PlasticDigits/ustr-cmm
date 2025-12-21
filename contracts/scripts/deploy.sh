#!/bin/bash
# USTR CMM Contract Deployment Script
# 
# This script handles the deployment of USTR CMM contracts to TerraClassic.
# 
# Prerequisites:
# - terrad CLI installed and configured
# - Wallet with sufficient LUNC for gas fees
# - Contracts compiled to WASM
#
# Usage:
#   ./deploy.sh <network> <wallet_name>
#   
#   network: testnet | mainnet
#   wallet_name: name of the key in terrad keyring

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARTIFACTS_DIR="${SCRIPT_DIR}/../artifacts"

# Network configurations
TESTNET_RPC="https://terra-classic-testnet-rpc.publicnode.com:443"
TESTNET_CHAIN_ID="rebel-2"
MAINNET_RPC="https://terra-classic-rpc.publicnode.com:443"
MAINNET_CHAIN_ID="columbus-5"

# Gas settings
GAS_PRICES="28.325uluna"
GAS_ADJUSTMENT="1.4"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
    echo "Usage: $0 <network> <wallet_name>"
    echo ""
    echo "  network:     testnet | mainnet"
    echo "  wallet_name: name of the key in terrad keyring"
    echo ""
    echo "Example:"
    echo "  $0 testnet mykey"
    exit 1
}

# Validate arguments
if [ $# -lt 2 ]; then
    usage
fi

NETWORK="$1"
WALLET="$2"

# Set network configuration
case "$NETWORK" in
    testnet)
        RPC="$TESTNET_RPC"
        CHAIN_ID="$TESTNET_CHAIN_ID"
        log_info "Deploying to TESTNET (${CHAIN_ID})"
        ;;
    mainnet)
        RPC="$MAINNET_RPC"
        CHAIN_ID="$MAINNET_CHAIN_ID"
        log_warn "Deploying to MAINNET (${CHAIN_ID})"
        read -p "Are you sure you want to deploy to mainnet? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Deployment cancelled"
            exit 0
        fi
        ;;
    *)
        log_error "Invalid network: $NETWORK"
        usage
        ;;
esac

# Common terrad flags
TERRAD_FLAGS="--node $RPC --chain-id $CHAIN_ID --gas-prices $GAS_PRICES --gas-adjustment $GAS_ADJUSTMENT --gas auto -y"

# Check if artifacts exist
check_artifacts() {
    local contracts=("ustr_token" "treasury" "ustc_swap" "airdrop")
    
    for contract in "${contracts[@]}"; do
        local wasm_file="${ARTIFACTS_DIR}/${contract}.wasm"
        if [ ! -f "$wasm_file" ]; then
            log_error "WASM artifact not found: $wasm_file"
            log_info "Please run 'cargo build --release --target wasm32-unknown-unknown' first"
            exit 1
        fi
    done
    
    log_info "All WASM artifacts found"
}

# Store a contract and return the code ID
store_contract() {
    local wasm_file="$1"
    local contract_name="$2"
    
    log_info "Storing $contract_name..."
    
    local result=$(terrad tx wasm store "$wasm_file" \
        --from "$WALLET" \
        $TERRAD_FLAGS \
        --output json)
    
    local txhash=$(echo "$result" | jq -r '.txhash')
    log_info "TX Hash: $txhash"
    
    # Wait for transaction to be included
    sleep 6
    
    local tx_result=$(terrad query tx "$txhash" --node "$RPC" --output json 2>/dev/null)
    local code_id=$(echo "$tx_result" | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
    
    if [ -z "$code_id" ] || [ "$code_id" == "null" ]; then
        log_error "Failed to get code ID for $contract_name"
        exit 1
    fi
    
    log_info "$contract_name stored with Code ID: $code_id"
    echo "$code_id"
}

# Instantiate a contract and return the contract address
instantiate_contract() {
    local code_id="$1"
    local init_msg="$2"
    local label="$3"
    
    log_info "Instantiating $label..."
    
    local result=$(terrad tx wasm instantiate "$code_id" "$init_msg" \
        --from "$WALLET" \
        --label "$label" \
        --admin "$WALLET" \
        $TERRAD_FLAGS \
        --output json)
    
    local txhash=$(echo "$result" | jq -r '.txhash')
    log_info "TX Hash: $txhash"
    
    # Wait for transaction to be included
    sleep 6
    
    local tx_result=$(terrad query tx "$txhash" --node "$RPC" --output json 2>/dev/null)
    local contract_addr=$(echo "$tx_result" | jq -r '.logs[0].events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value')
    
    if [ -z "$contract_addr" ] || [ "$contract_addr" == "null" ]; then
        log_error "Failed to get contract address for $label"
        exit 1
    fi
    
    log_info "$label instantiated at: $contract_addr"
    echo "$contract_addr"
}

# Main deployment flow
main() {
    log_info "Starting USTR CMM deployment..."
    
    # Check artifacts
    check_artifacts
    
    # Get wallet address
    WALLET_ADDR=$(terrad keys show "$WALLET" -a)
    log_info "Deploying from wallet: $WALLET_ADDR"
    
    # Store all contracts
    log_info "=== Storing Contracts ==="
    
    USTR_TOKEN_CODE_ID=$(store_contract "${ARTIFACTS_DIR}/ustr_token.wasm" "USTR Token")
    TREASURY_CODE_ID=$(store_contract "${ARTIFACTS_DIR}/treasury.wasm" "Treasury")
    USTC_SWAP_CODE_ID=$(store_contract "${ARTIFACTS_DIR}/ustc_swap.wasm" "USTC Swap")
    AIRDROP_CODE_ID=$(store_contract "${ARTIFACTS_DIR}/airdrop.wasm" "Airdrop")
    
    log_info "=== Instantiating Contracts ==="
    
    # 1. Instantiate USTR Token
    USTR_TOKEN_INIT="{\"name\":\"USTR\",\"symbol\":\"USTR\",\"decimals\":6,\"initial_balances\":[],\"initial_minters\":[\"$WALLET_ADDR\"],\"marketing\":null}"
    USTR_TOKEN_ADDR=$(instantiate_contract "$USTR_TOKEN_CODE_ID" "$USTR_TOKEN_INIT" "USTR Token")
    
    # 2. Instantiate Treasury
    TREASURY_INIT="{\"governance\":\"$WALLET_ADDR\"}"
    TREASURY_ADDR=$(instantiate_contract "$TREASURY_CODE_ID" "$TREASURY_INIT" "Treasury")
    
    # 3. Instantiate Airdrop
    AIRDROP_INIT="{\"admin\":\"$WALLET_ADDR\"}"
    AIRDROP_ADDR=$(instantiate_contract "$AIRDROP_CODE_ID" "$AIRDROP_INIT" "Airdrop")
    
    # 4. Instantiate USTC Swap (needs USTR token and Treasury addresses)
    # Note: start_time should be set appropriately for your deployment
    CURRENT_TIME=$(date +%s)
    START_TIME=$((CURRENT_TIME + 3600))  # 1 hour from now
    
    USTC_SWAP_INIT="{\"ustr_token\":\"$USTR_TOKEN_ADDR\",\"treasury\":\"$TREASURY_ADDR\",\"start_time\":$START_TIME,\"start_rate\":\"1.5\",\"end_rate\":\"2.5\",\"duration_seconds\":8640000,\"admin\":\"$WALLET_ADDR\"}"
    USTC_SWAP_ADDR=$(instantiate_contract "$USTC_SWAP_CODE_ID" "$USTC_SWAP_INIT" "USTC Swap")
    
    # 5. Add USTC Swap as a minter for USTR Token
    log_info "=== Post-Deployment Configuration ==="
    log_info "Adding USTC Swap as USTR minter..."
    
    terrad tx wasm execute "$USTR_TOKEN_ADDR" \
        "{\"add_minter\":{\"minter\":\"$USTC_SWAP_ADDR\"}}" \
        --from "$WALLET" \
        $TERRAD_FLAGS
    
    sleep 6
    
    # Output summary
    log_info "=== Deployment Complete ==="
    echo ""
    echo "Network: $NETWORK ($CHAIN_ID)"
    echo ""
    echo "Code IDs:"
    echo "  USTR Token:  $USTR_TOKEN_CODE_ID"
    echo "  Treasury:    $TREASURY_CODE_ID"
    echo "  USTC Swap:   $USTC_SWAP_CODE_ID"
    echo "  Airdrop:     $AIRDROP_CODE_ID"
    echo ""
    echo "Contract Addresses:"
    echo "  USTR Token:  $USTR_TOKEN_ADDR"
    echo "  Treasury:    $TREASURY_ADDR"
    echo "  USTC Swap:   $USTC_SWAP_ADDR"
    echo "  Airdrop:     $AIRDROP_ADDR"
    echo ""
    echo "Swap Start Time: $(date -d @$START_TIME 2>/dev/null || date -r $START_TIME)"
    echo ""
    
    # Save to file
    OUTPUT_FILE="${SCRIPT_DIR}/deployment-${NETWORK}-$(date +%Y%m%d-%H%M%S).json"
    cat > "$OUTPUT_FILE" << EOF
{
  "network": "$NETWORK",
  "chain_id": "$CHAIN_ID",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployer": "$WALLET_ADDR",
  "code_ids": {
    "ustr_token": $USTR_TOKEN_CODE_ID,
    "treasury": $TREASURY_CODE_ID,
    "ustc_swap": $USTC_SWAP_CODE_ID,
    "airdrop": $AIRDROP_CODE_ID
  },
  "contracts": {
    "ustr_token": "$USTR_TOKEN_ADDR",
    "treasury": "$TREASURY_ADDR",
    "ustc_swap": "$USTC_SWAP_ADDR",
    "airdrop": "$AIRDROP_ADDR"
  },
  "swap_config": {
    "start_time": $START_TIME,
    "start_rate": "1.5",
    "end_rate": "2.5",
    "duration_seconds": 8640000
  }
}
EOF
    
    log_info "Deployment info saved to: $OUTPUT_FILE"
}

main

