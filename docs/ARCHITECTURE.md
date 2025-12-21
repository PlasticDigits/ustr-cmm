# USTR CMM Architecture

## System Overview

The USTR CMM system consists of four primary smart contracts that work together to implement a collateralized stablecoin system on TerraClassic.

## Contract Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USTR CMM SYSTEM                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐                          ┌───────────────────┐   │
│  │    USER      │                          │    GOVERNANCE     │   │
│  │   Wallets    │                          │  (Admin/DAO)      │   │
│  └──────┬───────┘                          └─────────┬─────────┘   │
│         │                                            │             │
│         │ USTC                                       │             │
│         ▼                                            │             │
│  ┌──────────────┐        USTC              ┌─────────▼─────────┐   │
│  │  USTC-SWAP   │─────────────────────────▶│    TREASURY       │   │
│  │  CONTRACT    │                          │    CONTRACT       │   │
│  └──────┬───────┘                          └─────────┬─────────┘   │
│         │                                            │             │
│         │ Mint                              Withdraw │             │
│         ▼                                            ▼             │
│  ┌──────────────┐                          ┌───────────────────┐   │
│  │  USTR TOKEN  │                          │   Assets (USTC,   │   │
│  │  (CW20)      │                          │   CW20 tokens)    │   │
│  └──────────────┘                          └───────────────────┘   │
│                                                                     │
│  ┌──────────────┐     [PHASE 2]                                    │
│  │  UST1 TOKEN  │     Collateralized stablecoin                    │
│  │  (CW20)      │     minted against treasury assets               │
│  └──────────────┘                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Contract Responsibilities

### USTR Token Contract

**Purpose**: CW20 token representing protocol participation

**Implementation**: Uses [PlasticDigits/cw20-mintable](https://github.com/PlasticDigits/cw20-mintable) 
(Code ID: `10184` mainnet, `1641` testnet). No custom contract needed.

**Key Functions**:
- Standard CW20 operations (transfer, burn, allowance)
- Mintable extension for authorized minters
- Minters list management (AddMinter, RemoveMinter)

**Dependencies**: None (external contract)

### Treasury Contract

**Purpose**: Secure custody of all protocol assets

**Key Functions**:
- Accept and hold native tokens (USTC, LUNC)
- Accept and hold CW20 tokens
- Governance-controlled withdrawals
- 7-day timelock on governance changes

**Dependencies**: None (base contract)

### USTC-Swap Contract

**Purpose**: Time-limited USTC→USTR exchange

**Key Functions**:
- Accept USTC deposits
- Calculate current exchange rate
- Forward USTC to treasury
- Mint USTR to users

**Dependencies**: 
- USTR Token (minter)
- Treasury (recipient)

### UST1 Token Contract (Phase 2)

**Purpose**: Collateralized stablecoin

**Key Functions**:
- Mint against collateral
- Redeem for collateral
- Collateralization ratio management

**Dependencies**:
- Treasury (collateral source)
- Oracle (price feeds)

## Data Flow

### Swap Flow

```
1. User → USTC-Swap: Send USTC with Swap message
2. USTC-Swap: Calculate rate = start + (end - start) * elapsed / duration
3. USTC-Swap: Calculate ustr_amount = ustc_amount / rate
4. USTC-Swap → Treasury: Transfer USTC (native send)
5. USTC-Swap → USTR Token: Mint USTR to user
6. USTR Token → User: User receives USTR
```

### Governance Change Flow

```
1. Governance → Treasury: ProposeGovernance(new_address)
2. Treasury: Store pending_governance with execute_after = now + 7 days
3. [7 days pass]
4. New Address → Treasury: AcceptGovernance()
5. Treasury: Verify block_time >= execute_after
6. Treasury: Update governance = new_address
```

### Withdrawal Flow

```
1. Governance → Treasury: Withdraw(destination, asset, amount)
2. Treasury: Verify sender == governance
3a. If native: Treasury → Destination: BankMsg::Send
3b. If CW20: Treasury → CW20 Contract: Transfer to destination
```

## State Management

### USTR Token State

| Key | Type | Description |
|-----|------|-------------|
| `token_info` | `TokenInfo` | Name, symbol, decimals, total_supply |
| `balances` | `Map<Addr, Uint128>` | User balances |
| `allowances` | `Map<(Addr, Addr), AllowanceResponse>` | Spending allowances |
| `minters` | `Map<Addr, Empty>` | Authorized minter addresses |

### Treasury State

| Key | Type | Description |
|-----|------|-------------|
| `governance` | `Addr` | Current governance address |
| `pending_governance` | `Option<PendingGovernance>` | Pending governance change |
| `timelock_duration` | `u64` | Governance change delay (seconds) |

### USTC-Swap State

| Key | Type | Description |
|-----|------|-------------|
| `config` | `Config` | Token addresses, rates, timing |
| `total_ustc_received` | `Uint128` | Cumulative USTC deposited |
| `total_ustr_minted` | `Uint128` | Cumulative USTR issued |
| `paused` | `bool` | Emergency pause status |

## Security Model

### Access Control

| Contract | Role | Permissions |
|----------|------|-------------|
| USTR Token | Minter | Mint tokens |
| Treasury | Governance | Propose governance, withdraw |
| Treasury | Pending Governance | Accept governance |
| USTC-Swap | Admin | Pause/resume, update admin |
| USTC-Swap | Any User | Swap USTC for USTR |

### Timelock Protection

The 7-day timelock on treasury governance changes provides:
- Time for community to detect malicious proposals
- Opportunity to raise concerns before changes execute
- Protection against compromised keys taking immediate action

### Emergency Controls

The USTC-Swap contract includes emergency pause functionality:
- Admin can pause all swap operations
- Protects against discovered vulnerabilities
- Does not affect user token balances or treasury

## External Dependencies & Reference Code

This project uses git submodules to include external reference implementations. These serve both as 
dependencies for testing and as examples of properly written TerraClassic dapps.

### Git Submodules

Located in `contracts/external/`:

| Submodule | Repository | Purpose |
|-----------|------------|---------|
| `cw20-mintable` | [PlasticDigits/cw20-mintable](https://github.com/PlasticDigits/cw20-mintable) | CW20 token with multi-minter support |
| `cmm-ustc-preregister` | [PlasticDigits/cmm-ustc-preregister](https://github.com/PlasticDigits/cmm-ustc-preregister) | Pre-registration system (contracts + frontend) |

### Initialize Submodules

```bash
git submodule update --init --recursive
```

### Reference Examples

#### cw20-mintable

**Use as reference for**: CosmWasm smart contract development on TerraClassic

Key examples:
- `src/contract.rs` - Entry points, execute/query handlers
- `src/state.rs` - State management with cw-storage-plus
- `src/msg.rs` - Message definitions with cosmwasm-schema
- `src/error.rs` - Custom error types with thiserror

#### cmm-ustc-preregister

**Use as reference for**: Full-stack TerraClassic dapp development

| Directory | Contents | Examples |
|-----------|----------|----------|
| `smartcontracts-terraclassic/` | CosmWasm contracts | Contract structure, testing, deployment scripts |
| `smartcontracts-bsc/` | Solidity contracts (Foundry) | Cross-chain comparison |
| `frontend-dapp/` | React + TypeScript frontend | Wallet integration, contract interaction, UI patterns |

Key frontend examples in `frontend-dapp/`:
- `src/hooks/useTerraClassicWallet.ts` - TerraClassic wallet connection
- `src/hooks/useTerraClassicContract.ts` - Contract queries and execution
- `src/services/terraclassic/` - LCD client, transaction building
- `src/components/` - Reusable UI components

---

## Upgrade Path

### Phase 1 → Phase 2

Adding UST1 stablecoin:
1. Deploy UST1 token contract
2. Deploy collateralization contract (configured to query treasury balances for CR calculation)
3. Add collateralization contract as UST1 minter
4. Collateral remains in treasury; governance may authorize withdrawals only for buyback auctions (when UST1 trades below $1)

### Phase 2 → Phase 3

Transitioning to DAO governance:
1. Deploy DAO governance contract
2. Propose DAO contract as new treasury governance
3. After 7-day timelock, DAO accepts governance
4. All treasury operations now require DAO approval

