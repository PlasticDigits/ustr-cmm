# USTR CMM Contract Interfaces

This document provides detailed interface specifications for all USTR CMM smart contracts.

> **📖 Official Documentation**: For TerraClassic network documentation, see [terra-classic.io/docs](https://terra-classic.io/docs).
>
> **Development Reference**: For working examples of TerraClassic contract patterns, see the 
> git submodules in `contracts/external/`. The `cw20-mintable` submodule demonstrates CosmWasm 
> contract structure, and `cmm-ustc-preregister/smartcontracts-terraclassic/` shows a complete 
> contract with tests and deployment scripts.

## USTR Token Contract

Uses [PlasticDigits/cw20-mintable](https://github.com/PlasticDigits/cw20-mintable) directly.

**Note**: We do not maintain a custom token contract. The USTR and UST1 tokens are instantiated 
using the existing cw20-mintable code deployed on TerraClassic (Code ID: `10184` mainnet, `1641` testnet).
The cw20-mintable source is included as a git submodule in `contracts/external/cw20-mintable/` for 
local testing and development purposes.

### InstantiateMsg

```rust
pub struct InstantiateMsg {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,  // CW20 Mintable uses 18 decimals; CMM compatible with any decimal count
    pub initial_balances: Vec<Cw20Coin>,
    pub mint: Option<MinterResponse>,
    pub marketing: Option<InstantiateMarketingInfo>,
}
```

### ExecuteMsg

```rust
pub enum ExecuteMsg {
    // CW20 Standard
    Transfer { recipient: String, amount: Uint128 },
    Burn { amount: Uint128 },
    Send { contract: String, amount: Uint128, msg: Binary },
    IncreaseAllowance { spender: String, amount: Uint128, expires: Option<Expiration> },
    DecreaseAllowance { spender: String, amount: Uint128, expires: Option<Expiration> },
    TransferFrom { owner: String, recipient: String, amount: Uint128 },
    SendFrom { owner: String, contract: String, amount: Uint128, msg: Binary },
    BurnFrom { owner: String, amount: Uint128 },
    
    // Mintable Extension
    Mint { recipient: String, amount: Uint128 },
    AddMinter { minter: String },
    RemoveMinter { minter: String },
    
    // Marketing Extension
    UpdateMarketing { project: Option<String>, description: Option<String>, marketing: Option<String> },
    UploadLogo(Logo),
}
```

### QueryMsg

```rust
pub enum QueryMsg {
    // CW20 Standard
    Balance { address: String },
    TokenInfo {},
    Minter {},
    Allowance { owner: String, spender: String },
    AllAllowances { owner: String, start_after: Option<String>, limit: Option<u32> },
    AllAccounts { start_after: Option<String>, limit: Option<u32> },
    
    // Mintable Extension
    Minters { start_after: Option<String>, limit: Option<u32> },
    
    // Marketing Extension
    MarketingInfo {},
    DownloadLogo {},
}
```

---

## Treasury Contract

### InstantiateMsg

```rust
pub struct InstantiateMsg {
    /// Initial governance address (admin wallet)
    pub governance: String,
    /// Optional: Override default 7-day timelock (in seconds)
    pub timelock_duration: Option<u64>,
}
```

### ExecuteMsg

```rust
pub enum ExecuteMsg {
    /// Propose a new governance address (starts 7-day timelock)
    ProposeGovernance { 
        new_governance: String 
    },
    
    /// Accept governance (called by pending governance after timelock)
    AcceptGovernance {},
    
    /// Cancel pending governance change
    CancelGovernanceProposal {},
    
    /// Withdraw assets from treasury (governance only)
    Withdraw {
        destination: String,
        asset: AssetInfo,
        amount: Uint128,
    },
    
    /// CW20 receive hook for accepting token deposits
    Receive(Cw20ReceiveMsg),
}
```

### QueryMsg

```rust
pub enum QueryMsg {
    /// Returns current configuration
    Config {},
    
    /// Returns pending governance proposal if any
    PendingGovernance {},
    
    /// Returns balance for a specific asset
    Balance { asset: AssetInfo },
    
    /// Returns all tracked balances
    AllBalances {},
}
```

### Response Types

```rust
pub struct ConfigResponse {
    pub governance: Addr,
    pub timelock_duration: u64,  // seconds
}

pub struct PendingGovernanceResponse {
    pub new_governance: Addr,
    pub execute_after: Timestamp,
    pub time_remaining: u64,  // seconds until executable
}

pub struct BalanceResponse {
    pub asset: AssetInfo,
    pub amount: Uint128,
}

pub struct AllBalancesResponse {
    pub native: Vec<Coin>,
    pub cw20: Vec<Cw20Balance>,
}

pub struct Cw20Balance {
    pub contract_addr: Addr,
    pub amount: Uint128,
}
```

---

## USTC-Swap Contract

### InstantiateMsg

```rust
pub struct InstantiateMsg {
    /// USTR token contract address
    pub ustr_token: String,
    
    /// Treasury contract address
    pub treasury: String,
    
    /// Optional: Start time (defaults to instantiation time)
    pub start_time: Option<u64>,
    
    /// Starting exchange rate (USTC per USTR, e.g., "1.5")
    pub start_rate: Decimal,
    
    /// Ending exchange rate (USTC per USTR, e.g., "2.5")
    pub end_rate: Decimal,
    
    /// Duration in seconds (100 days = 8640000)
    pub duration_seconds: u64,
    
    /// Admin address for emergency operations
    pub admin: String,
    
    /// USTC denomination (typically "uusd")
    pub ustc_denom: String,
}
```

### ExecuteMsg

```rust
pub enum ExecuteMsg {
    /// Swap USTC for USTR (send USTC as native funds)
    Swap {},
    
    /// Emergency pause (admin only)
    EmergencyPause {},
    
    /// Resume after emergency pause (admin only)
    EmergencyResume {},
    
    /// Update admin address (admin only)
    UpdateAdmin { new_admin: String },
}
```

### QueryMsg

```rust
pub enum QueryMsg {
    /// Returns contract configuration
    Config {},
    
    /// Returns current exchange rate
    CurrentRate {},
    
    /// Simulate a swap for given USTC amount
    SwapSimulation { ustc_amount: Uint128 },
    
    /// Returns swap period status
    Status {},
    
    /// Returns cumulative statistics
    Stats {},
}
```

### Response Types

```rust
pub struct ConfigResponse {
    pub ustr_token: Addr,
    pub treasury: Addr,
    pub start_time: Timestamp,
    pub end_time: Timestamp,
    pub start_rate: Decimal,
    pub end_rate: Decimal,
    pub admin: Addr,
    pub ustc_denom: String,
    pub paused: bool,
}

pub struct RateResponse {
    /// Current USTC per USTR rate
    pub rate: Decimal,
    /// Timestamp of rate calculation
    pub timestamp: Timestamp,
}

pub struct SimulationResponse {
    /// Input USTC amount
    pub ustc_amount: Uint128,
    /// Output USTR amount
    pub ustr_amount: Uint128,
    /// Rate used for calculation
    pub rate: Decimal,
}

pub struct StatusResponse {
    /// Whether swap period has started
    pub started: bool,
    /// Whether swap period has ended
    pub ended: bool,
    /// Whether contract is paused
    pub paused: bool,
    /// Seconds until start (0 if started)
    pub seconds_until_start: u64,
    /// Seconds until end (0 if ended)
    pub seconds_until_end: u64,
    /// Elapsed seconds since start
    pub elapsed_seconds: u64,
}

pub struct StatsResponse {
    /// Total USTC received
    pub total_ustc_received: Uint128,
    /// Total USTR minted
    pub total_ustr_minted: Uint128,
    /// Number of swaps executed
    pub swap_count: u64,
}
```

---

## Common Types

### AssetInfo

```rust
pub enum AssetInfo {
    Native { denom: String },
    Cw20 { contract_addr: Addr },
}
```

### Asset

```rust
pub struct Asset {
    pub info: AssetInfo,
    pub amount: Uint128,
}
```

## Decimal Handling

The CMM system handles tokens with varying decimal configurations:

| Token Type | Typical Decimals | Example |
|------------|------------------|---------|
| Native `uusd` | 6 | 1 USTC = 1,000,000 uusd |
| CW20 Mintable | 18 | 1 USTR = 10^18 base units |
| Other CW20s | Varies | Checked on-chain |

**CR Calculation**: The system queries each token's on-chain decimal count and normalizes all values before calculating collateralization ratios. This ensures oracle prices (typically in USD per whole token) match the internal accounting regardless of decimal configuration.

## On-Chain Tax Handling

TerraClassic applies a **USTC Burn Tax** on `uusd` transfers. Per the [official TerraClassic tax documentation](https://terra-classic.io/docs/develop/module-specifications/tax):

- `ComputeTax()` multiplies each spend coin by `BurnTaxRate` and truncates to integers
- Zero results skip deduction
- The treasury receives the **post-tax amount** when USTC is transferred

**Impact on CMM**:
- When transferring USTC from preregistration to treasury, the burn tax applies
- CR calculations account for the actual received amount
- The burn tax reduces circulating USTC supply (ecosystem benefit)

---

## Events

### Treasury Events

```rust
// Governance proposed
#[cw_serde]
pub struct GovernanceProposedEvent {
    pub current_governance: Addr,
    pub proposed_governance: Addr,
    pub execute_after: Timestamp,
}

// Governance accepted
#[cw_serde]
pub struct GovernanceAcceptedEvent {
    pub previous_governance: Addr,
    pub new_governance: Addr,
}

// Governance proposal cancelled
#[cw_serde]
pub struct GovernanceCancelledEvent {
    pub cancelled_proposal: Addr,
}

// Withdrawal executed
#[cw_serde]
pub struct WithdrawalEvent {
    pub destination: Addr,
    pub asset: AssetInfo,
    pub amount: Uint128,
}
```

### USTC-Swap Events

```rust
// Swap executed
#[cw_serde]
pub struct SwapEvent {
    pub user: Addr,
    pub ustc_amount: Uint128,
    pub ustr_amount: Uint128,
    pub rate: Decimal,
    pub timestamp: Timestamp,
}

// Emergency pause/resume
#[cw_serde]
pub struct PauseEvent {
    pub paused: bool,
    pub admin: Addr,
}
```

