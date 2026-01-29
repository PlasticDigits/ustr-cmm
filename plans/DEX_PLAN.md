# TerraClassic DEX Proposal: UST1 Burn DEX

## Executive Summary

A next-generation decentralized exchange for TerraClassic featuring v2 (constant product AMM) and v3 (concentrated liquidity) pools with an omnirouter for optimal trade execution. This DEX introduces a novel fee structure designed to maximize UST1 burn while incentivizing long-term trading activity within the platform.

> **Important**: This DEX exclusively supports **CW20 tokens only**. Native tokens (LUNC, USTC, etc.) are NOT supported. The fee token is **UST1** (a CW20 token), not native USTC.

### Key Differentiators

- **No LP Fee Revenue**: Liquidity providers do not earn trading fees
- **Flat UST1 Burn Per Trade**: Every trade burns a flat amount of UST1 (configurable, default 0.4999 UST1)
- **Exit Fee with UST1 Burn**: 2.99% fee on withdrawals used to purchase and burn UST1
- **Advanced Trading Wallet**: Users who burn 500 UST1 unlock fee-reduced internal trading
- **Discount Tiers**: Progressive fee reduction based on cumulative UST1 burns
- **CoinGecko-Compatible API**: Full market data API for aggregators and trackers

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Smart Contract Design](#2-smart-contract-design)
3. [Fee Structure](#3-fee-structure)
4. [Advanced Trading Wallet System](#4-advanced-trading-wallet-system)
5. [Discount Tier System](#5-discount-tier-system)
6. [Backend Architecture](#6-backend-architecture)
7. [Database Schema](#7-database-schema)
8. [CoinGecko-Compatible API](#8-coingecko-compatible-api)
9. [Frontend Design](#9-frontend-design)
10. [Security Considerations](#10-security-considerations)
11. [Implementation Phases](#11-implementation-phases)
12. [Technical Specifications](#12-technical-specifications)

---

## 1. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React/Next.js)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Swap UI   │  │ Liquidity   │  │  Portfolio  │  │  Advanced Trading   │ │
│  │             │  │    UI       │  │     UI      │  │      Wallet UI      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Node.js/Rust)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ REST API    │  │ WebSocket   │  │   Indexer   │  │  CoinGecko API      │ │
│  │ Gateway     │  │   Server    │  │   Service   │  │    Endpoints        │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                      │                                       │
│                         ┌────────────┴────────────┐                         │
│                         ▼                         ▼                         │
│                  ┌─────────────┐          ┌─────────────┐                   │
│                  │  PostgreSQL │          │    Redis    │                   │
│                  │  (Events,   │          │  (Cache,    │                   │
│                  │   Charts)   │          │   PubSub)   │                   │
│                  └─────────────┘          └─────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TERRACLASSIC BLOCKCHAIN                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         OMNIROUTER CONTRACT                           │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │  Route Optimization │ Fee Collection │ Burn Execution │ Tiers  │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                    │                              │                          │
│         ┌─────────┴─────────┐          ┌─────────┴─────────┐                │
│         ▼                   ▼          ▼                   ▼                │
│  ┌─────────────┐     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  V2 Pools   │     │  V3 Pools   │  │  Trading    │  │   Tier      │     │
│  │  (AMM)      │     │ (Conc.Liq) │  │   Wallet    │  │   Registry  │     │
│  └─────────────┘     └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Smart Contracts | CosmWasm (Rust) | Native TerraClassic support, CW20 standard, security |
| Backend API | Node.js + TypeScript | Fast development, ecosystem |
| Indexer | Rust | Performance for high-throughput indexing |
| Database | PostgreSQL 15+ | Time-series data, complex queries |
| Cache | Redis | Real-time price feeds, session management |
| Frontend | Next.js 14+ / React | SSR, performance, DX |
| WebSocket | Socket.io | Real-time price updates |

---

## 2. Smart Contract Design

### 2.1 Contract Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OMNIROUTER                                │
│  - Route calculation across V2/V3 pools                         │
│  - Fee deduction and UST1 burn execution                        │
│  - Multi-hop swap orchestration                                  │
│  - Slippage protection                                           │
└─────────────────────────────────────────────────────────────────┘
         │              │                │               │
         ▼              ▼                ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐
│ V2 Factory  │ │ V3 Factory  │ │  Trading    │ │ Tier Registry   │
│             │ │             │ │  Wallet     │ │                 │
│ - Create    │ │ - Create    │ │ - Deposits  │ │ - Burn records  │
│   pairs     │ │   pools     │ │ - Balances  │ │ - Tier levels   │
│ - Pool      │ │ - Tick      │ │ - Internal  │ │ - Fee discounts │
│   registry  │ │   spacing   │ │   swaps     │ │                 │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘
         │              │
         ▼              ▼
┌─────────────┐ ┌─────────────┐
│  V2 Pair    │ │  V3 Pool    │
│  Contracts  │ │  Contracts  │
│             │ │             │
│ x * y = k   │ │ Concentrated│
│ Constant    │ │  Liquidity  │
│ Product     │ │  Positions  │
└─────────────┘ └─────────────┘
```

### 2.2 CW20 Token Standard

All tokens on this DEX must be CW20-compliant. Native tokens (LUNC, USTC, etc.) are **not supported**.

```rust
/// CW20 Asset representation - NO native token support
pub struct Cw20Asset {
    pub contract_addr: Addr,    // CW20 contract address
    pub amount: Uint128,
}

/// Token info for pool configuration
pub struct Cw20TokenInfo {
    pub contract_addr: Addr,
    pub symbol: String,
    pub decimals: u8,
}

/// UST1 is the fee token (CW20)
pub struct Ust1Config {
    pub contract_addr: Addr,    // UST1 CW20 contract address
    pub decimals: u8,           // Typically 6
}
```

### 2.3 V2 Pool Contract (Constant Product AMM)

```rust
// V2 Pair - CW20 tokens only
pub struct V2Pair {
    pub token0: Addr,           // CW20 contract address
    pub token1: Addr,           // CW20 contract address
    pub reserve0: Uint128,
    pub reserve1: Uint128,
    pub total_lp_shares: Uint128,
    pub lp_token: Addr,         // CW20 LP token contract
    pub factory: Addr,
}

pub enum ExecuteMsg {
    /// Receive CW20 tokens (entry point for swaps/liquidity)
    Receive(Cw20ReceiveMsg),
    
    /// Add liquidity (called after CW20 transfer)
    ProvideLiquidity {
        assets: [Cw20Asset; 2],
        slippage_tolerance: Option<Decimal>,
        receiver: Option<String>,
    },
    
    /// Remove liquidity (LP tokens sent via Receive)
    WithdrawLiquidity {},
}

/// CW20 Receive hook for token transfers
pub enum Cw20HookMsg {
    /// Swap the received tokens
    Swap {
        belief_price: Option<Decimal>,
        max_spread: Option<Decimal>,
        to: Option<String>,
    },
    /// Provide as liquidity (paired with other token)
    ProvideLiquidity {
        paired_asset: Cw20Asset,
        slippage_tolerance: Option<Decimal>,
    },
    /// Withdraw liquidity (for LP tokens)
    WithdrawLiquidity {},
}
```

### 2.4 V3 Pool Contract (Concentrated Liquidity)

```rust
// V3 Pool - CW20 tokens only
pub struct V3Pool {
    pub token0: Addr,               // CW20 contract address
    pub token1: Addr,               // CW20 contract address
    pub fee_tier: u32,              // Pool fee tier (unused for LP rewards)
    pub tick_spacing: i32,
    pub sqrt_price: Uint256,        // Current sqrt(price) as Q64.96
    pub current_tick: i32,
    pub liquidity: Uint128,         // Active liquidity
    pub fee_growth_global_0: Uint256,
    pub fee_growth_global_1: Uint256,
    pub position_nft: Addr,         // CW721 position NFT contract
    pub factory: Addr,
}

pub struct Position {
    pub owner: Addr,
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub liquidity: Uint128,
    pub fee_growth_inside_0_last: Uint256,
    pub fee_growth_inside_1_last: Uint256,
    pub tokens_owed_0: Uint128,     // Always 0 - no fee rewards
    pub tokens_owed_1: Uint128,     // Always 0 - no fee rewards
}

pub enum ExecuteMsg {
    /// Initialize pool with starting price
    Initialize { sqrt_price: Uint256 },
    
    /// Mint a new position
    Mint {
        tick_lower: i32,
        tick_upper: i32,
        amount: Uint128,
        recipient: String,
    },
    
    /// Add liquidity to existing position
    IncreaseLiquidity {
        position_id: u64,
        amount_0_desired: Uint128,
        amount_1_desired: Uint128,
        amount_0_min: Uint128,
        amount_1_min: Uint128,
    },
    
    /// Remove liquidity from position
    DecreaseLiquidity {
        position_id: u64,
        liquidity: Uint128,
        amount_0_min: Uint128,
        amount_1_min: Uint128,
    },
    
    /// Collect (unused - no fees to collect)
    Collect { position_id: u64 },
    
    /// Receive CW20 tokens for swap
    Receive(Cw20ReceiveMsg),
}

/// CW20 hook for V3 swaps
pub enum Cw20HookMsg {
    Swap {
        sqrt_price_limit: Uint256,
        recipient: Option<String>,
    },
}
```

### 2.5 Omnirouter Contract

```rust
pub struct OmnirouterConfig {
    pub owner: Addr,
    pub v2_factory: Addr,
    pub v3_factory: Addr,
    pub trading_wallet: Addr,
    pub tier_registry: Addr,
    pub ust1_token: Addr,               // UST1 CW20 contract address (NOT USTC)
    pub flat_burn_fee: Uint128,         // Default: 499900 (0.4999 UST1)
    pub withdrawal_fee_bps: u16,        // 299 = 2.99%
    pub advanced_unlock_burn: Uint128,  // 500_000000 (500 UST1)
}

pub enum ExecuteMsg {
    /// Receive CW20 tokens (entry point for all swaps)
    Receive(Cw20ReceiveMsg),
    
    /// Swap using trading wallet (advanced users)
    SwapFromTradingWallet {
        route: Vec<SwapHop>,
        amount_in: Uint128,
        min_amount_out: Uint128,
    },
    
    /// Withdraw from trading wallet (triggers exit fee)
    WithdrawFromTradingWallet {
        token: Addr,                // CW20 token address
        amount: Uint128,
        recipient: Option<String>,
    },
    
    /// Update configuration (admin only)
    UpdateConfig {
        flat_burn_fee: Option<Uint128>,
        withdrawal_fee_bps: Option<u16>,
        tier_config: Option<Vec<TierConfig>>,
    },
}

/// CW20 Receive hook for router swaps
pub enum Cw20HookMsg {
    /// Standard swap through external wallet
    SwapExact {
        route: Vec<SwapHop>,
        min_amount_out: Uint128,
        recipient: Option<String>,
    },
    /// Multi-hop swap with split routes
    SwapMultiHop {
        routes: Vec<Route>,
        min_amount_out: Uint128,
        recipient: Option<String>,
    },
}

pub struct SwapHop {
    pub pool_type: PoolType,        // V2 or V3
    pub pool_addr: Addr,
    pub token_in: Addr,             // CW20 contract address
    pub token_out: Addr,            // CW20 contract address
}

pub enum PoolType {
    V2,
    V3 { fee_tier: u32 },
}

pub struct Route {
    pub hops: Vec<SwapHop>,
    pub weight_bps: u16,  // For split routes, must sum to 10000
}
```

### 2.6 Trading Wallet Contract

```rust
pub struct TradingWalletConfig {
    pub router: Addr,
    pub tier_registry: Addr,
    pub unlock_burn_amount: Uint128,  // 500 UST1 to unlock
    pub ust1_token: Addr,             // UST1 CW20 contract (NOT USTC)
}

pub struct UserWallet {
    pub owner: Addr,
    pub is_unlocked: bool,
    pub unlock_timestamp: Option<u64>,
    pub balances: Vec<(Addr, Uint128)>,  // (CW20 token addr, amount)
}

pub enum ExecuteMsg {
    /// Receive CW20 tokens (for deposits and unlock)
    Receive(Cw20ReceiveMsg),
    
    /// Internal swap (no exit fee, only flat UST1 burn)
    SwapInternal {
        offer_token: Addr,          // CW20 token address
        offer_amount: Uint128,
        ask_token: Addr,            // CW20 token address
        min_return: Option<Uint128>,
    },
    
    /// Withdraw assets (triggers 2.99% exit fee)
    Withdraw {
        token: Addr,                // CW20 token address
        amount: Uint128,
    },
}

/// CW20 Receive hook
pub enum Cw20HookMsg {
    /// Burn UST1 to unlock advanced trading
    UnlockAdvancedTrading {},
    /// Deposit tokens into trading wallet
    Deposit {},
}

pub enum QueryMsg {
    UserWallet { address: String },
    IsUnlocked { address: String },
    Balance { address: String, token: String },
    AllBalances { address: String },
}
```

### 2.7 Tier Registry Contract

```rust
pub struct TierRegistryConfig {
    pub owner: Addr,
    pub ust1_token: Addr,           // UST1 CW20 contract (NOT USTC)
    pub tiers: Vec<TierConfig>,
}

pub struct TierConfig {
    pub tier_id: u8,
    pub name: String,
    pub required_burn: Uint128,         // Cumulative UST1 burned
    pub flat_fee_discount_bps: u16,     // Discount on flat fee (basis points)
    // Note: Discount does NOT apply to withdrawal fees
}

// Default Tier Configuration
// Tier 0 (Default):   0 UST1 burned      → 0.4999 UST1 flat fee
// Tier 1 (Bronze):    5,000 UST1 burned  → 0.2499 UST1 flat fee (50% discount)
// Tier 2 (Silver):    50,000 UST1 burned → 0.1199 UST1 flat fee (76% discount)
// Tier 3 (Gold):      150,000 UST1 burned→ 0.0124 UST1 flat fee (97.5% discount)
// Tier 4 (Diamond):   500,000 UST1 burned→ 0.0012 UST1 flat fee (99.76% discount)

pub struct UserTierInfo {
    pub address: Addr,
    pub total_burned: Uint128,
    pub current_tier: u8,
    pub tier_name: String,
    pub current_flat_fee: Uint128,
}

pub enum ExecuteMsg {
    /// Receive CW20 UST1 tokens to burn for tier upgrade
    Receive(Cw20ReceiveMsg),
    
    /// Admin: Update tier configuration
    UpdateTiers { tiers: Vec<TierConfig> },
    
    /// Admin: Add new tier
    AddTier { tier: TierConfig },
}

/// CW20 Receive hook
pub enum Cw20HookMsg {
    /// Burn UST1 to increase tier
    BurnForTier {},
}

pub enum QueryMsg {
    /// Get user's tier information
    UserTier { address: String },
    
    /// Get all tier configurations
    TierConfigs {},
    
    /// Calculate fee for user
    CalculateFee { address: String, is_withdrawal: bool },
}
```

---

## 3. Fee Structure

### 3.1 Fee Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            STANDARD SWAP (External Wallet)                   │
│                                                                              │
│   User Wallet                                                                │
│       │                                                                      │
│       ▼                                                                      │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │  1. User sends tokens + UST1 for flat fee                         │     │
│   │  2. Router calculates optimal route                               │     │
│   │  3. Flat UST1 fee (0.4999 UST1 * tier multiplier) → BURN          │     │
│   │  4. Swap executes across V2/V3 pools                              │     │
│   │  5. Output tokens sent to user wallet                             │     │
│   │                                                                    │     │
│   │  Total Cost: Flat UST1 Fee + Slippage                             │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│       │                                                                      │
│       ▼                                                                      │
│   UST1 BURNED: 0.4999 UST1 (or discounted based on tier)                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     ADVANCED TRADING WALLET SWAP                             │
│                                                                              │
│   Trading Wallet (Pre-funded)                                                │
│       │                                                                      │
│       ▼                                                                      │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │  1. User initiates swap from trading wallet                       │     │
│   │  2. Flat UST1 fee deducted from wallet → BURN                     │     │
│   │  3. Swap executes across V2/V3 pools                              │     │
│   │  4. Output tokens remain in trading wallet                        │     │
│   │                                                                    │     │
│   │  Total Cost: Flat UST1 Fee only (tier discounts apply)            │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│       │                                                                      │
│       ▼                                                                      │
│   UST1 BURNED: 0.4999 UST1 (or discounted based on tier)                    │
│   NO EXIT FEE (funds stay in DEX)                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         WITHDRAWAL FROM TRADING WALLET                       │
│                                                                              │
│   Trading Wallet                                                             │
│       │                                                                      │
│       ▼                                                                      │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │  1. User requests withdrawal of X tokens                          │     │
│   │  2. Exit fee: 2.99% of withdrawal value                           │     │
│   │  3. 2.99% used to market-buy UST1                                 │     │
│   │  4. Purchased UST1 → BURN                                         │     │
│   │  5. Remaining 97.01% sent to user wallet                          │     │
│   │                                                                    │     │
│   │  NOTE: Tier discounts do NOT apply to withdrawal fees             │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│       │                                                                      │
│       ▼                                                                      │
│   UST1 BURNED: ~3% of withdrawal value (purchased at market rate)           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Fee Calculation Logic

```rust
/// Calculate the flat fee for a user based on their tier
pub fn calculate_flat_fee(
    base_fee: Uint128,           // 499900 (0.4999 UST1, 6 decimals)
    user_tier: &UserTierInfo,
    is_withdrawal: bool,
) -> Uint128 {
    // Tier discounts never apply to withdrawals
    if is_withdrawal {
        return base_fee;
    }
    
    // Apply tier discount
    let discount_bps = user_tier.tier_discount_bps;
    let discount = base_fee.multiply_ratio(discount_bps, 10000u128);
    base_fee.checked_sub(discount).unwrap_or(Uint128::zero())
}

/// Calculate withdrawal exit fee
pub fn calculate_exit_fee(
    withdrawal_amount: Uint128,
    exit_fee_bps: u16,           // 299 = 2.99%
) -> Uint128 {
    withdrawal_amount.multiply_ratio(exit_fee_bps as u128, 10000u128)
}
```

### 3.3 Fee Configuration Table

| Fee Type | Amount | Applies To | Tier Discount |
|----------|--------|------------|---------------|
| Flat Trade Fee | 0.4999 UST1 | All swaps | Yes |
| Exit Fee | 2.99% | Withdrawals from Trading Wallet | **No** |
| Advanced Unlock | 500 UST1 (one-time burn) | Unlock Trading Wallet | N/A |

### 3.4 Why No LP Fees?

Traditional DEXes distribute trading fees to liquidity providers. This DEX takes a different approach:

1. **100% UST1 Burn**: All fees are used to burn UST1 (CW20), supporting the token's deflationary mechanics
2. **Simpler LP Experience**: LPs provide liquidity without complex fee tracking
3. **LP Incentives via External Mechanisms**: LPs can be incentivized through:
   - Governance token emissions (CW20)
   - Partner token incentives
   - External staking rewards
4. **Prevents Vampire Attacks**: Without fee revenue, there's less incentive for copy-paste forks

---

## 4. Advanced Trading Wallet System

### 4.1 Concept Overview

The Advanced Trading Wallet is an on-chain custodial wallet system that allows frequent traders to avoid the 2.99% exit fee by keeping their funds within the DEX ecosystem.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRADING WALLET LIFECYCLE                              │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   LOCKED     │───▶│  UNLOCKING   │───▶│   UNLOCKED   │                  │
│  │              │    │              │    │              │                  │
│  │ Cannot use   │    │ Burn 500     │    │ Full access  │                  │
│  │ trading      │    │ UST1         │    │ to trading   │                  │
│  │ wallet       │    │              │    │ wallet       │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                │                            │
│                                                ▼                            │
│                            ┌─────────────────────────────────┐             │
│                            │     TRADING WALLET OPERATIONS    │             │
│                            │                                  │             │
│                            │  • Deposit any supported token   │             │
│                            │  • Swap between any pairs        │             │
│                            │  • Only flat UST1 fee per trade  │             │
│                            │  • No exit fee while internal    │             │
│                            │  • Withdraw anytime (2.99% fee)  │             │
│                            └─────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Trading Wallet Benefits

| Feature | Standard Wallet | Trading Wallet |
|---------|-----------------|----------------|
| Per-Trade Fee | 0.4999 UST1 | 0.4999 UST1 (tier discounts apply) |
| Exit Fee | None | 2.99% on withdrawal |
| Unlock Cost | None | 500 UST1 burn (one-time) |
| Best For | Occasional traders | Active/frequent traders |
| Break-Even | - | ~17 trades without withdrawal |

### 4.3 Implementation Details

```rust
// Trading Wallet Storage
pub const USER_WALLETS: Map<&Addr, UserWallet> = Map::new("user_wallets");
pub const WALLET_BALANCES: Map<(&Addr, &str), Uint128> = Map::new("wallet_balances");

impl TradingWallet {
    /// Unlock advanced trading by burning UST1 (CW20)
    /// Called via CW20 Receive hook when UST1 is sent
    pub fn unlock(
        &mut self,
        env: Env,
        sender: Addr,
        ust1_amount: Uint128,
    ) -> Result<Response, ContractError> {
        if ust1_amount < self.config.unlock_burn_amount {
            return Err(ContractError::InsufficientUnlockFee {
                required: self.config.unlock_burn_amount,
                sent: ust1_amount,
            });
        }
        
        // Burn the UST1 via CW20 burn
        let burn_msg = WasmMsg::Execute {
            contract_addr: self.config.ust1_token.to_string(),
            msg: to_binary(&Cw20ExecuteMsg::Burn { amount: ust1_amount })?,
            funds: vec![],
        };
        
        // Update user wallet state
        let mut wallet = self.get_or_create_wallet(&sender);
        wallet.is_unlocked = true;
        wallet.unlock_timestamp = Some(env.block.time.seconds());
        self.save_wallet(&sender, &wallet)?;
        
        Ok(Response::new()
            .add_message(burn_msg)
            .add_attribute("action", "unlock_advanced_trading")
            .add_attribute("user", sender.to_string())
            .add_attribute("ust1_burned", ust1_amount.to_string()))
    }
    
    /// Execute swap within trading wallet
    pub fn swap_internal(
        &mut self,
        sender: Addr,
        offer_token: Addr,
        offer_amount: Uint128,
        ask_token: Addr,
        min_return: Option<Uint128>,
    ) -> Result<Response, ContractError> {
        // Verify wallet is unlocked
        let wallet = self.get_wallet(&sender)?;
        if !wallet.is_unlocked {
            return Err(ContractError::WalletNotUnlocked {});
        }
        
        // Verify balance
        let balance = self.get_balance(&sender, &offer_token)?;
        if balance < offer_amount {
            return Err(ContractError::InsufficientBalance {
                available: balance,
                required: offer_amount,
            });
        }
        
        // Calculate and deduct flat fee (with tier discount)
        let user_tier = self.query_tier_registry(&sender)?;
        let flat_fee = calculate_flat_fee(
            self.config.base_flat_fee,
            &user_tier,
            false,  // not a withdrawal
        );
        
        // Deduct UST1 fee from wallet
        self.deduct_balance(&sender, &self.config.ust1_token, flat_fee)?;
        
        // Execute swap via router (internal accounting)
        // ... router swap logic ...
        
        // Update balances
        self.deduct_balance(&sender, &offer_token, offer_amount)?;
        self.add_balance(&sender, &ask_token, output_amount)?;
        
        // Burn the flat fee via CW20
        let burn_msg = WasmMsg::Execute {
            contract_addr: self.config.ust1_token.to_string(),
            msg: to_binary(&Cw20ExecuteMsg::Burn { amount: flat_fee })?,
            funds: vec![],
        };
        
        Ok(Response::new()
            .add_message(burn_msg)
            .add_attribute("action", "swap_internal")
            .add_attribute("ust1_burned", flat_fee.to_string()))
    }
}
```

---

## 5. Discount Tier System

### 5.1 Tier Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DISCOUNT TIER PROGRESSION                          │
│                                                                              │
│  UST1 Burned    Tier        Flat Fee      Discount    Savings per 100 trades│
│  ────────────   ─────────   ───────────   ─────────   ─────────────────────│
│  0              Default     0.4999 UST1   0%          -                      │
│  5,000          Bronze      0.2499 UST1   50.0%       25.00 UST1            │
│  50,000         Silver      0.1199 UST1   76.0%       38.00 UST1            │
│  150,000        Gold        0.0124 UST1   97.5%       48.75 UST1            │
│  500,000        Diamond     0.0012 UST1   99.76%      49.87 UST1            │
│                                                                              │
│  ⚠️  IMPORTANT: Tier discounts do NOT apply to withdrawal exit fees (2.99%)  │
│      This prevents toxic flow gaming the system                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Tier Upgrade Mechanics

```rust
pub struct TierConfig {
    pub tier_id: u8,
    pub name: String,
    pub required_burn: Uint128,
    pub flat_fee_multiplier_bps: u16,  // 10000 = 100% (no discount), 5000 = 50%
}

// Default tier configuration
pub fn default_tiers() -> Vec<TierConfig> {
    vec![
        TierConfig {
            tier_id: 0,
            name: "Default".to_string(),
            required_burn: Uint128::zero(),
            flat_fee_multiplier_bps: 10000,  // 100% of base fee (0.4999)
        },
        TierConfig {
            tier_id: 1,
            name: "Bronze".to_string(),
            required_burn: Uint128::from(5_000_000000u128),  // 5,000 UST1
            flat_fee_multiplier_bps: 5000,   // 50% of base fee (0.2499)
        },
        TierConfig {
            tier_id: 2,
            name: "Silver".to_string(),
            required_burn: Uint128::from(50_000_000000u128),  // 50,000 UST1
            flat_fee_multiplier_bps: 2400,   // 24% of base fee (0.1199)
        },
        TierConfig {
            tier_id: 3,
            name: "Gold".to_string(),
            required_burn: Uint128::from(150_000_000000u128),  // 150,000 UST1
            flat_fee_multiplier_bps: 248,    // 2.48% of base fee (0.0124)
        },
        TierConfig {
            tier_id: 4,
            name: "Diamond".to_string(),
            required_burn: Uint128::from(500_000_000000u128),  // 500,000 UST1
            flat_fee_multiplier_bps: 24,     // 0.24% of base fee (0.0012)
        },
    ]
}
```

### 5.3 Anti-Gaming Measures (Toxic Flow Prevention)

The tier system is designed to prevent gaming:

1. **No Withdrawal Discounts**: The 2.99% exit fee is NEVER discounted, regardless of tier
2. **Cumulative Burns Only**: Only direct UST1 burns count toward tier progression
3. **Non-Transferable**: Tier status is bound to the wallet address
4. **No Tier Decay**: Once earned, tiers are permanent (subject to governance)

```rust
/// Check if discount applies to transaction type
pub fn discount_applies(transaction_type: TransactionType) -> bool {
    match transaction_type {
        TransactionType::Swap => true,
        TransactionType::SwapInternal => true,
        TransactionType::Withdrawal => false,  // NEVER discounted
        TransactionType::Deposit => true,      // No fees on deposit
    }
}
```

---

## 6. Backend Architecture

### 6.1 Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND SERVICES                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         API GATEWAY (Node.js)                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │   REST      │  │  GraphQL    │  │  WebSocket  │  │  CoinGecko │ │   │
│  │  │   /api/v1   │  │  /graphql   │  │   /ws       │  │   /api/cg  │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                    ┌─────────────────┼─────────────────┐                   │
│                    ▼                 ▼                 ▼                   │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐  │
│  │   INDEXER SERVICE   │ │   PRICE SERVICE     │ │  ANALYTICS SERVICE  │  │
│  │   (Rust)            │ │   (Node.js)         │ │  (Node.js)          │  │
│  │                     │ │                     │ │                     │  │
│  │ • Block streaming   │ │ • TWAP calculation  │ │ • Volume tracking   │  │
│  │ • Event parsing     │ │ • Price aggregation │ │ • TVL calculation   │  │
│  │ • DB writes         │ │ • Oracle feeds      │ │ • User stats        │  │
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘  │
│            │                       │                       │               │
│            └───────────────────────┴───────────────────────┘               │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           DATA LAYER                                 │   │
│  │  ┌─────────────────────────┐       ┌─────────────────────────────┐  │   │
│  │  │      PostgreSQL         │       │           Redis             │  │   │
│  │  │                         │       │                             │  │   │
│  │  │  • Trade history        │       │  • Price cache (5s TTL)     │  │   │
│  │  │  • OHLCV candles        │       │  • Session management       │  │   │
│  │  │  • Pool states          │       │  • Rate limiting            │  │   │
│  │  │  • User tiers           │       │  • PubSub for WebSocket     │  │   │
│  │  │  • Burn history         │       │  • Hot path caching         │  │   │
│  │  └─────────────────────────┘       └─────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Indexer Service (Rust)

The indexer is a high-performance Rust service that streams blocks from TerraClassic and processes DEX events.

```rust
// Indexer main loop
pub async fn run_indexer(config: IndexerConfig) -> Result<()> {
    let client = TerraClient::new(&config.lcd_endpoint, &config.rpc_endpoint)?;
    let db = Database::connect(&config.database_url).await?;
    
    let mut last_block = db.get_last_indexed_block().await?;
    
    loop {
        let latest_block = client.get_latest_block_height().await?;
        
        while last_block < latest_block {
            let block = client.get_block(last_block + 1).await?;
            let txs = client.get_block_txs(last_block + 1).await?;
            
            for tx in txs {
                process_transaction(&db, &tx, block.header.time).await?;
            }
            
            last_block += 1;
            db.update_last_indexed_block(last_block).await?;
        }
        
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

async fn process_transaction(db: &Database, tx: &TxResponse, timestamp: DateTime<Utc>) -> Result<()> {
    for event in &tx.events {
        match event.r#type.as_str() {
            "wasm-swap" => process_swap_event(db, event, timestamp).await?,
            "wasm-provide_liquidity" => process_liquidity_event(db, event, timestamp, true).await?,
            "wasm-withdraw_liquidity" => process_liquidity_event(db, event, timestamp, false).await?,
            "wasm-burn_ust1" => process_burn_event(db, event, timestamp).await?,
            "wasm-tier_upgrade" => process_tier_event(db, event, timestamp).await?,
            "wasm-trading_wallet_deposit" => process_wallet_event(db, event, timestamp).await?,
            "wasm-trading_wallet_withdraw" => process_withdrawal_event(db, event, timestamp).await?,
            _ => {}
        }
    }
    Ok(())
}
```

### 6.3 Price Service

```typescript
// services/price.service.ts
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

interface PriceData {
  price: string;
  priceChange24h: string;
  volume24h: string;
  timestamp: number;
}

@Injectable()
export class PriceService {
  constructor(
    private readonly redis: Redis,
    private readonly db: Pool,
  ) {}

  async getPrice(baseToken: string, quoteToken: string): Promise<PriceData> {
    const cacheKey = `price:${baseToken}:${quoteToken}`;
    
    // Check cache first (5 second TTL)
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Calculate from recent trades
    const result = await this.db.query(`
      SELECT 
        (SELECT price FROM trades 
         WHERE base_token = $1 AND quote_token = $2 
         ORDER BY timestamp DESC LIMIT 1) as current_price,
        (SELECT price FROM trades 
         WHERE base_token = $1 AND quote_token = $2 
         AND timestamp >= NOW() - INTERVAL '24 hours'
         ORDER BY timestamp ASC LIMIT 1) as price_24h_ago,
        (SELECT SUM(quote_amount) FROM trades 
         WHERE base_token = $1 AND quote_token = $2 
         AND timestamp >= NOW() - INTERVAL '24 hours') as volume_24h
    `, [baseToken, quoteToken]);

    const priceData: PriceData = {
      price: result.rows[0].current_price,
      priceChange24h: this.calculatePriceChange(
        result.rows[0].current_price,
        result.rows[0].price_24h_ago
      ),
      volume24h: result.rows[0].volume_24h,
      timestamp: Date.now(),
    };

    await this.redis.setex(cacheKey, 5, JSON.stringify(priceData));
    return priceData;
  }

  async getOHLCV(
    baseToken: string,
    quoteToken: string,
    interval: string,
    limit: number = 100
  ): Promise<OHLCV[]> {
    const intervalMap: Record<string, string> = {
      '1m': '1 minute',
      '5m': '5 minutes',
      '15m': '15 minutes',
      '1h': '1 hour',
      '4h': '4 hours',
      '1d': '1 day',
      '1w': '1 week',
    };

    const result = await this.db.query(`
      SELECT 
        time_bucket($3::interval, timestamp) as bucket,
        first(price, timestamp) as open,
        max(price) as high,
        min(price) as low,
        last(price, timestamp) as close,
        sum(base_amount) as volume
      FROM trades
      WHERE base_token = $1 AND quote_token = $2
      GROUP BY bucket
      ORDER BY bucket DESC
      LIMIT $4
    `, [baseToken, quoteToken, intervalMap[interval], limit]);

    return result.rows.map(row => ({
      timestamp: new Date(row.bucket).getTime(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));
  }
}
```

---

## 7. Database Schema

### 7.1 Core Tables

```sql
-- Database: dex_db
-- Extensions
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- POOL MANAGEMENT
-- =============================================================================

CREATE TABLE pools (
    id SERIAL PRIMARY KEY,
    contract_address VARCHAR(64) UNIQUE NOT NULL,
    pool_type VARCHAR(10) NOT NULL CHECK (pool_type IN ('v2', 'v3')),
    token0_address VARCHAR(64) NOT NULL,
    token0_symbol VARCHAR(20) NOT NULL,
    token0_decimals SMALLINT NOT NULL,
    token1_address VARCHAR(64) NOT NULL,
    token1_symbol VARCHAR(20) NOT NULL,
    token1_decimals SMALLINT NOT NULL,
    fee_tier INTEGER,  -- Only for V3 pools
    tick_spacing INTEGER,  -- Only for V3 pools
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_tx_hash VARCHAR(64),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_pools_tokens ON pools(token0_address, token1_address);
CREATE INDEX idx_pools_type ON pools(pool_type);

-- =============================================================================
-- TRADES / SWAPS
-- =============================================================================

CREATE TABLE trades (
    id BIGSERIAL,
    tx_hash VARCHAR(64) NOT NULL,
    pool_id INTEGER REFERENCES pools(id),
    sender VARCHAR(64) NOT NULL,
    recipient VARCHAR(64),
    base_token VARCHAR(64) NOT NULL,
    quote_token VARCHAR(64) NOT NULL,
    base_amount NUMERIC(38, 0) NOT NULL,
    quote_amount NUMERIC(38, 0) NOT NULL,
    price NUMERIC(38, 18) NOT NULL,
    price_usd NUMERIC(38, 18),
    ust1_fee_burned NUMERIC(38, 0) NOT NULL DEFAULT 0,
    is_trading_wallet BOOLEAN DEFAULT FALSE,
    trade_type VARCHAR(20) DEFAULT 'standard',  -- 'standard', 'internal', 'withdrawal'
    timestamp TIMESTAMPTZ NOT NULL,
    block_height BIGINT NOT NULL,
    PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('trades', 'timestamp');

CREATE INDEX idx_trades_pool ON trades(pool_id, timestamp DESC);
CREATE INDEX idx_trades_sender ON trades(sender, timestamp DESC);
CREATE INDEX idx_trades_tokens ON trades(base_token, quote_token, timestamp DESC);

-- =============================================================================
-- OHLCV CANDLES (Continuous Aggregates)
-- =============================================================================

-- 1-minute candles
CREATE MATERIALIZED VIEW candles_1m
WITH (timescaledb.continuous) AS
SELECT
    pool_id,
    time_bucket('1 minute', timestamp) AS bucket,
    first(price, timestamp) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, timestamp) AS close,
    sum(base_amount) AS volume,
    count(*) AS trade_count
FROM trades
GROUP BY pool_id, bucket;

-- 1-hour candles
CREATE MATERIALIZED VIEW candles_1h
WITH (timescaledb.continuous) AS
SELECT
    pool_id,
    time_bucket('1 hour', timestamp) AS bucket,
    first(price, timestamp) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, timestamp) AS close,
    sum(base_amount) AS volume,
    count(*) AS trade_count
FROM trades
GROUP BY pool_id, bucket;

-- 1-day candles
CREATE MATERIALIZED VIEW candles_1d
WITH (timescaledb.continuous) AS
SELECT
    pool_id,
    time_bucket('1 day', timestamp) AS bucket,
    first(price, timestamp) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, timestamp) AS close,
    sum(base_amount) AS volume,
    count(*) AS trade_count
FROM trades
GROUP BY pool_id, bucket;

-- Refresh policies
SELECT add_continuous_aggregate_policy('candles_1m',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute');

SELECT add_continuous_aggregate_policy('candles_1h',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('candles_1d',
    start_offset => INTERVAL '1 week',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day');

-- =============================================================================
-- LIQUIDITY EVENTS
-- =============================================================================

CREATE TABLE liquidity_events (
    id BIGSERIAL,
    tx_hash VARCHAR(64) NOT NULL,
    pool_id INTEGER REFERENCES pools(id),
    provider VARCHAR(64) NOT NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('add', 'remove')),
    token0_amount NUMERIC(38, 0) NOT NULL,
    token1_amount NUMERIC(38, 0) NOT NULL,
    lp_tokens NUMERIC(38, 0),  -- For V2
    position_id BIGINT,  -- For V3
    tick_lower INTEGER,  -- For V3
    tick_upper INTEGER,  -- For V3
    liquidity NUMERIC(38, 0),  -- For V3
    timestamp TIMESTAMPTZ NOT NULL,
    block_height BIGINT NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('liquidity_events', 'timestamp');

-- =============================================================================
-- UST1 BURNS (CW20 token, NOT USTC)
-- =============================================================================

CREATE TABLE ust1_burns (
    id BIGSERIAL,
    tx_hash VARCHAR(64) NOT NULL,
    burner VARCHAR(64) NOT NULL,
    amount NUMERIC(38, 0) NOT NULL,
    burn_type VARCHAR(30) NOT NULL CHECK (burn_type IN (
        'trade_fee',
        'withdrawal_fee', 
        'tier_upgrade',
        'trading_wallet_unlock'
    )),
    related_trade_id BIGINT,
    timestamp TIMESTAMPTZ NOT NULL,
    block_height BIGINT NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('ust1_burns', 'timestamp');

CREATE INDEX idx_burns_burner ON ust1_burns(burner, timestamp DESC);
CREATE INDEX idx_burns_type ON ust1_burns(burn_type, timestamp DESC);

-- =============================================================================
-- USER TIERS
-- =============================================================================

CREATE TABLE user_tiers (
    id SERIAL PRIMARY KEY,
    address VARCHAR(64) UNIQUE NOT NULL,
    total_burned NUMERIC(38, 0) NOT NULL DEFAULT 0,
    current_tier SMALLINT NOT NULL DEFAULT 0,
    tier_name VARCHAR(20) NOT NULL DEFAULT 'Default',
    current_flat_fee NUMERIC(38, 0) NOT NULL DEFAULT 499900,
    trading_wallet_unlocked BOOLEAN DEFAULT FALSE,
    trading_wallet_unlock_tx VARCHAR(64),
    trading_wallet_unlock_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_tiers_tier ON user_tiers(current_tier);

-- =============================================================================
-- TRADING WALLET BALANCES
-- =============================================================================

CREATE TABLE trading_wallet_balances (
    id SERIAL PRIMARY KEY,
    address VARCHAR(64) NOT NULL,
    token_address VARCHAR(64) NOT NULL,
    token_symbol VARCHAR(20) NOT NULL,
    balance NUMERIC(38, 0) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(address, token_address)
);

CREATE INDEX idx_wallet_balances_address ON trading_wallet_balances(address);

-- =============================================================================
-- TRADING WALLET EVENTS
-- =============================================================================

CREATE TABLE trading_wallet_events (
    id BIGSERIAL,
    tx_hash VARCHAR(64) NOT NULL,
    address VARCHAR(64) NOT NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('deposit', 'withdraw', 'swap')),
    token_address VARCHAR(64) NOT NULL,
    amount NUMERIC(38, 0) NOT NULL,
    fee_paid NUMERIC(38, 0) DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL,
    block_height BIGINT NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('trading_wallet_events', 'timestamp');

-- =============================================================================
-- POOL SNAPSHOTS (for TVL tracking)
-- =============================================================================

CREATE TABLE pool_snapshots (
    id BIGSERIAL,
    pool_id INTEGER REFERENCES pools(id),
    reserve0 NUMERIC(38, 0) NOT NULL,
    reserve1 NUMERIC(38, 0) NOT NULL,
    reserve0_usd NUMERIC(38, 18),
    reserve1_usd NUMERIC(38, 18),
    tvl_usd NUMERIC(38, 18),
    sqrt_price NUMERIC(78, 0),  -- For V3
    current_tick INTEGER,  -- For V3
    liquidity NUMERIC(38, 0),  -- For V3
    timestamp TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('pool_snapshots', 'timestamp');

-- =============================================================================
-- INDEXER STATE
-- =============================================================================

CREATE TABLE indexer_state (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO indexer_state (key, value) VALUES 
    ('last_indexed_block', '0'),
    ('indexer_version', '1.0.0');

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- Pool summary view
CREATE VIEW pool_summary AS
SELECT 
    p.id,
    p.contract_address,
    p.pool_type,
    p.token0_symbol,
    p.token1_symbol,
    ps.reserve0,
    ps.reserve1,
    ps.tvl_usd,
    (SELECT volume FROM candles_1d WHERE pool_id = p.id ORDER BY bucket DESC LIMIT 1) as volume_24h,
    (SELECT COUNT(*) FROM trades WHERE pool_id = p.id AND timestamp > NOW() - INTERVAL '24 hours') as trades_24h
FROM pools p
LEFT JOIN LATERAL (
    SELECT * FROM pool_snapshots 
    WHERE pool_id = p.id 
    ORDER BY timestamp DESC 
    LIMIT 1
) ps ON TRUE;

-- Burn statistics view
CREATE VIEW burn_stats AS
SELECT
    DATE_TRUNC('day', timestamp) as date,
    burn_type,
    COUNT(*) as burn_count,
    SUM(amount) as total_burned
FROM ust1_burns
GROUP BY DATE_TRUNC('day', timestamp), burn_type
ORDER BY date DESC;

-- User tier distribution
CREATE VIEW tier_distribution AS
SELECT
    current_tier,
    tier_name,
    COUNT(*) as user_count,
    SUM(total_burned) as total_burned
FROM user_tiers
GROUP BY current_tier, tier_name
ORDER BY current_tier;
```

---

## 8. CoinGecko-Compatible API

### 8.1 API Endpoints

The DEX provides a CoinGecko-compatible API for integration with aggregators, trackers, and portfolio managers.

```
Base URL: https://api.dex.terraclassic.io/api/cg/v1
```

### 8.2 Endpoint Specifications

#### GET /pairs

Returns all trading pairs available on the DEX.

```json
// Response
[
  {
    "ticker_id": "wLUNC_UST1",
    "base": "wLUNC",
    "target": "UST1",
    "pool_id": "terra1abc...xyz"
  },
  {
    "ticker_id": "UST1_axlUSDC",
    "base": "UST1",
    "target": "axlUSDC",
    "pool_id": "terra1def...uvw"
  }
]
```

#### GET /tickers

Returns 24-hour market data for all pairs.

```json
// Response
[
  {
    "ticker_id": "wLUNC_UST1",
    "base_currency": "wLUNC",
    "target_currency": "UST1",
    "last_price": "0.00005123",
    "base_volume": "1234567890",
    "target_volume": "63245",
    "bid": "0.00005120",
    "ask": "0.00005126",
    "high": "0.00005500",
    "low": "0.00004900",
    "pool_id": "terra1abc...xyz",
    "liquidity_in_usd": "1500000.00"
  }
]
```

#### GET /orderbook

Returns current liquidity depth (simulated for AMM).

```json
// Request
GET /orderbook?ticker_id=wLUNC_UST1&depth=100

// Response
{
  "ticker_id": "wLUNC_UST1",
  "timestamp": 1706500000000,
  "bids": [
    ["0.00005120", "10000000"],
    ["0.00005100", "25000000"],
    ["0.00005080", "50000000"]
  ],
  "asks": [
    ["0.00005126", "10000000"],
    ["0.00005150", "25000000"],
    ["0.00005180", "50000000"]
  ]
}
```

#### GET /historical_trades

Returns historical trade data.

```json
// Request
GET /historical_trades?ticker_id=wLUNC_UST1&type=buy&limit=100

// Response
{
  "buy": [
    {
      "trade_id": 123456,
      "price": "0.00005123",
      "base_volume": "1000000",
      "target_volume": "51.23",
      "trade_timestamp": 1706500000000,
      "type": "buy"
    }
  ]
}
```

### 8.3 Extended API Endpoints (DEX-Specific)

#### GET /api/v1/stats

Returns global DEX statistics.

```json
{
  "total_tvl_usd": "15000000.00",
  "total_volume_24h_usd": "2500000.00",
  "total_ust1_burned": "125000000000",
  "total_trades_24h": 15234,
  "unique_traders_24h": 892,
  "pool_count": 45,
  "tier_stats": {
    "default": 5000,
    "bronze": 1200,
    "silver": 350,
    "gold": 75,
    "diamond": 12
  }
}
```

#### GET /api/v1/burns

Returns UST1 burn statistics.

```json
// Request
GET /api/v1/burns?period=24h

// Response
{
  "period": "24h",
  "total_burned": "1500000000",
  "burn_breakdown": {
    "trade_fee": "800000000",
    "withdrawal_fee": "500000000",
    "tier_upgrade": "150000000",
    "trading_wallet_unlock": "50000000"
  },
  "burn_rate_per_hour": "62500000"
}
```

#### GET /api/v1/user/:address/tier

Returns user tier information.

```json
{
  "address": "terra1...",
  "total_burned": "55000000000",
  "current_tier": 2,
  "tier_name": "Silver",
  "current_flat_fee": "119900",
  "next_tier": {
    "tier": 3,
    "name": "Gold",
    "required_burn": "150000000000",
    "remaining": "95000000000"
  },
  "trading_wallet": {
    "unlocked": true,
    "unlock_date": "2024-01-15T10:30:00Z"
  }
}
```

#### GET /api/v1/user/:address/wallet

Returns trading wallet balances.

```json
{
  "address": "terra1...",
  "unlocked": true,
  "balances": [
    {
      "token": "LUNC",
      "address": "uluna",
      "balance": "1000000000000",
      "balance_usd": "50.00"
    },
    {
      "token": "UST1",
      "address": "uusd",
      "balance": "50000000000",
      "balance_usd": "500.00"
    }
  ],
  "total_value_usd": "550.00"
}
```

### 8.4 WebSocket API

```typescript
// WebSocket endpoint: wss://api.dex.terraclassic.io/ws

// Subscribe to price updates
{
  "method": "subscribe",
  "params": {
    "channel": "ticker",
    "pairs": ["wLUNC_UST1", "UST1_axlUSDC"]
  }
}

// Subscribe to trades
{
  "method": "subscribe",
  "params": {
    "channel": "trades",
    "pairs": ["wLUNC_UST1"]
  }
}

// Subscribe to burn events
{
  "method": "subscribe",
  "params": {
    "channel": "burns"
  }
}

// Price update message
{
  "channel": "ticker",
  "pair": "wLUNC_UST1",
  "data": {
    "price": "0.00005123",
    "change_24h": "2.5",
    "volume_24h": "1234567890",
    "timestamp": 1706500000000
  }
}

// Trade message
{
  "channel": "trades",
  "pair": "wLUNC_UST1",
  "data": {
    "id": 123456,
    "price": "0.00005123",
    "amount": "1000000",
    "side": "buy",
    "timestamp": 1706500000000
  }
}

// Burn message
{
  "channel": "burns",
  "data": {
    "type": "trade_fee",
    "amount": "499900",
    "burner": "terra1...",
    "tx_hash": "ABC123...",
    "timestamp": 1706500000000
  }
}
```

---

## 9. Frontend Design

### 9.1 Application Structure

```
frontend/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Landing/Dashboard
│   │   ├── swap/
│   │   │   └── page.tsx          # Swap interface
│   │   ├── pools/
│   │   │   ├── page.tsx          # Pool list
│   │   │   └── [address]/
│   │   │       └── page.tsx      # Pool detail
│   │   ├── liquidity/
│   │   │   ├── add/page.tsx
│   │   │   └── remove/page.tsx
│   │   ├── wallet/
│   │   │   └── page.tsx          # Trading wallet
│   │   ├── tiers/
│   │   │   └── page.tsx          # Tier status & upgrade
│   │   └── analytics/
│   │       └── page.tsx          # Charts & stats
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Footer.tsx
│   │   ├── swap/
│   │   │   ├── SwapCard.tsx
│   │   │   ├── TokenSelector.tsx
│   │   │   ├── PriceImpact.tsx
│   │   │   └── RouteDisplay.tsx
│   │   ├── pool/
│   │   │   ├── PoolCard.tsx
│   │   │   ├── LiquidityForm.tsx
│   │   │   └── PositionManager.tsx   # V3 positions
│   │   ├── wallet/
│   │   │   ├── TradingWallet.tsx
│   │   │   ├── BalanceList.tsx
│   │   │   └── UnlockModal.tsx
│   │   ├── tier/
│   │   │   ├── TierCard.tsx
│   │   │   ├── TierProgress.tsx
│   │   │   └── BurnModal.tsx
│   │   ├── charts/
│   │   │   ├── PriceChart.tsx
│   │   │   ├── VolumeChart.tsx
│   │   │   └── BurnChart.tsx
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       ├── TokenLogo.tsx
│   │       └── ConnectWallet.tsx
│   ├── hooks/
│   │   ├── useSwap.ts
│   │   ├── usePools.ts
│   │   ├── useTradingWallet.ts
│   │   ├── useTier.ts
│   │   ├── usePrices.ts
│   │   └── useWebSocket.ts
│   ├── lib/
│   │   ├── contracts/
│   │   │   ├── router.ts
│   │   │   ├── v2-pair.ts
│   │   │   ├── v3-pool.ts
│   │   │   ├── trading-wallet.ts
│   │   │   └── tier-registry.ts
│   │   ├── api/
│   │   │   └── client.ts
│   │   └── utils/
│   │       ├── format.ts
│   │       └── calculations.ts
│   └── styles/
│       └── globals.css
├── public/
│   └── tokens/                   # Token logos
└── package.json
```

### 9.2 Key UI Components

#### Swap Interface

```tsx
// components/swap/SwapCard.tsx
export function SwapCard() {
  const { address, tier, tradingWallet } = useWallet();
  const [mode, setMode] = useState<'standard' | 'advanced'>('standard');
  
  return (
    <Card className="w-full max-w-md mx-auto">
      {/* Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={mode === 'standard' ? 'primary' : 'ghost'}
          onClick={() => setMode('standard')}
        >
          Standard Swap
        </Button>
        <Button
          variant={mode === 'advanced' ? 'primary' : 'ghost'}
          onClick={() => setMode('advanced')}
          disabled={!tradingWallet.unlocked}
        >
          Advanced Trading
          {!tradingWallet.unlocked && <LockIcon className="ml-1" />}
        </Button>
      </div>
      
      {/* Token Input */}
      <TokenInput
        label="From"
        token={fromToken}
        amount={fromAmount}
        balance={mode === 'advanced' ? tradingWallet.balance : walletBalance}
        onTokenSelect={setFromToken}
        onAmountChange={setFromAmount}
      />
      
      <SwapButton onClick={handleSwap} />
      
      <TokenInput
        label="To"
        token={toToken}
        amount={toAmount}
        readOnly
      />
      
      {/* Fee Display */}
      <FeeBreakdown
        mode={mode}
        tier={tier}
        estimatedOutput={toAmount}
      />
      
      {/* Route Display */}
      <RouteDisplay route={bestRoute} />
    </Card>
  );
}
```

#### Fee Breakdown Component

```tsx
// components/swap/FeeBreakdown.tsx
export function FeeBreakdown({ mode, tier, estimatedOutput }) {
  const flatFee = calculateTierFee(tier);
  const exitFee = mode === 'advanced' ? 0 : estimatedOutput * 0.0299;
  
  return (
    <div className="mt-4 p-3 bg-gray-800 rounded-lg text-sm">
      <div className="flex justify-between">
        <span className="text-gray-400">Flat UST1 Fee</span>
        <span className="text-white">
          {formatUst1(flatFee)} UST1
          {tier.tier > 0 && (
            <Badge variant="green" className="ml-2">
              {tier.discount}% discount
            </Badge>
          )}
        </span>
      </div>
      
      {mode === 'standard' && (
        <div className="flex justify-between mt-2">
          <span className="text-gray-400">Exit Fee (2.99%)</span>
          <span className="text-white">{formatUsd(exitFee)}</span>
        </div>
      )}
      
      {mode === 'advanced' && (
        <div className="flex items-center mt-2 text-green-400">
          <CheckIcon className="w-4 h-4 mr-1" />
          No exit fee (funds stay in trading wallet)
        </div>
      )}
      
      <div className="border-t border-gray-700 mt-2 pt-2">
        <div className="flex justify-between font-medium">
          <span>Total UST1 Burned</span>
          <span className="text-orange-400">
            🔥 {formatUst1(flatFee + (exitFee * ust1Price))} UST1
          </span>
        </div>
      </div>
    </div>
  );
}
```

#### Tier Progress Component

```tsx
// components/tier/TierProgress.tsx
export function TierProgress({ userTier }) {
  const tiers = [
    { id: 0, name: 'Default', burn: 0, fee: '0.4999' },
    { id: 1, name: 'Bronze', burn: 5000, fee: '0.2499' },
    { id: 2, name: 'Silver', burn: 50000, fee: '0.1199' },
    { id: 3, name: 'Gold', burn: 150000, fee: '0.0124' },
    { id: 4, name: 'Diamond', burn: 500000, fee: '0.0012' },
  ];
  
  const currentTier = tiers[userTier.current_tier];
  const nextTier = tiers[userTier.current_tier + 1];
  const progress = nextTier 
    ? ((userTier.total_burned - currentTier.burn) / (nextTier.burn - currentTier.burn)) * 100
    : 100;
  
  return (
    <Card>
      <h3 className="text-xl font-bold mb-4">Your Tier Status</h3>
      
      {/* Current Tier Display */}
      <div className="flex items-center gap-4 mb-6">
        <TierBadge tier={currentTier} size="lg" />
        <div>
          <p className="text-2xl font-bold">{currentTier.name}</p>
          <p className="text-gray-400">
            {formatUst1(userTier.total_burned)} UST1 burned
          </p>
        </div>
      </div>
      
      {/* Fee Display */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-400">Your flat fee per trade</p>
        <p className="text-3xl font-bold text-green-400">
          {currentTier.fee} UST1
        </p>
        {currentTier.id > 0 && (
          <p className="text-sm text-gray-400">
            Saving {((0.4999 - parseFloat(currentTier.fee)) * 100 / 0.4999).toFixed(1)}% 
            vs default
          </p>
        )}
      </div>
      
      {/* Progress to Next Tier */}
      {nextTier && (
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Progress to {nextTier.name}</span>
            <span>{formatUst1(nextTier.burn - userTier.total_burned)} UST1 to go</span>
          </div>
          <ProgressBar value={progress} />
          <Button 
            className="w-full mt-4"
            onClick={() => openBurnModal(nextTier)}
          >
            Burn UST1 to Upgrade
          </Button>
        </div>
      )}
      
      {/* Tier Benefits */}
      <TierBenefitsTable currentTier={currentTier.id} />
    </Card>
  );
}
```

### 9.3 Trading Wallet UI

```tsx
// components/wallet/TradingWallet.tsx
export function TradingWallet() {
  const { address } = useWallet();
  const { wallet, isUnlocked, unlock, deposit, withdraw } = useTradingWallet(address);
  
  if (!isUnlocked) {
    return (
      <Card className="text-center py-12">
        <LockIcon className="w-16 h-16 mx-auto mb-4 text-gray-500" />
        <h2 className="text-2xl font-bold mb-2">Advanced Trading Wallet</h2>
        <p className="text-gray-400 mb-6 max-w-md mx-auto">
          Unlock the trading wallet to swap without exit fees. 
          Only pay the flat UST1 fee per trade.
        </p>
        
        <div className="bg-gray-800 rounded-lg p-4 mb-6 max-w-sm mx-auto">
          <p className="text-sm text-gray-400">One-time unlock cost</p>
          <p className="text-3xl font-bold">500 UST1</p>
          <p className="text-xs text-orange-400 mt-1">
            🔥 Burned permanently
          </p>
        </div>
        
        <Button onClick={unlock} size="lg">
          Burn 500 UST1 to Unlock
        </Button>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Wallet Summary */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Trading Wallet</h2>
          <Badge variant="green">Unlocked</Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Total Value</p>
            <p className="text-2xl font-bold">{formatUsd(wallet.totalValue)}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Assets</p>
            <p className="text-2xl font-bold">{wallet.balances.length}</p>
          </div>
        </div>
        
        {/* Balance List */}
        <BalanceList 
          balances={wallet.balances} 
          onDeposit={deposit}
          onWithdraw={withdraw}
        />
      </Card>
      
      {/* Withdrawal Warning */}
      <Alert variant="warning">
        <AlertCircleIcon className="w-5 h-5" />
        <div>
          <p className="font-medium">Withdrawal Fee Applies</p>
          <p className="text-sm text-gray-400">
            2.99% fee on all withdrawals, used to buy and burn UST1.
            Tier discounts do not apply to withdrawals.
          </p>
        </div>
      </Alert>
    </div>
  );
}
```

---

## 10. Security Considerations

### 10.1 Smart Contract Security

#### Audit Requirements
- [ ] Full audit by reputable firm (Oak Security, Halborn, etc.)
- [ ] Additional audit focused on omnirouter logic
- [ ] Bug bounty program ($50k-$200k depending on severity)

#### Security Measures

```rust
// Reentrancy Protection
pub struct ReentrancyGuard {
    locked: bool,
}

impl ReentrancyGuard {
    pub fn lock(&mut self) -> Result<(), ContractError> {
        if self.locked {
            return Err(ContractError::ReentrancyDetected {});
        }
        self.locked = true;
        Ok(())
    }
    
    pub fn unlock(&mut self) {
        self.locked = false;
    }
}

// Slippage Protection
pub fn validate_slippage(
    expected: Uint128,
    actual: Uint128,
    max_slippage_bps: u16,
) -> Result<(), ContractError> {
    let min_acceptable = expected.multiply_ratio(10000 - max_slippage_bps as u128, 10000u128);
    if actual < min_acceptable {
        return Err(ContractError::SlippageExceeded {
            expected,
            actual,
            max_slippage_bps,
        });
    }
    Ok(())
}

// Pause Mechanism
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    
    // Check if contract is paused
    if config.is_paused && !matches!(msg, ExecuteMsg::Unpause {}) {
        return Err(ContractError::ContractPaused {});
    }
    
    // ... rest of execution
}
```

### 10.2 Backend Security

- **Rate Limiting**: 100 requests/minute per IP for public endpoints
- **API Key Authentication**: Required for elevated rate limits
- **Input Validation**: All user inputs sanitized and validated
- **SQL Injection Prevention**: Parameterized queries only
- **DDoS Protection**: Cloudflare or similar CDN/WAF
- **HTTPS Only**: All endpoints require TLS 1.3

### 10.3 Frontend Security

- **CSP Headers**: Strict Content Security Policy
- **No Sensitive Data in Client**: All signing happens in wallet
- **Transaction Preview**: Show exact on-chain effects before signing
- **URL Validation**: Prevent phishing through malicious links

### 10.4 Operational Security

- **Multi-sig Admin**: 3-of-5 multi-sig for contract upgrades
- **Timelock**: 24-48 hour delay on critical parameter changes
- **Emergency Pause**: Guardian address can pause contracts
- **Monitoring**: 24/7 alerting on suspicious activity

---

## 11. Implementation Phases

### Phase 1: Foundation (8-10 weeks)

#### Week 1-3: Core Smart Contracts
- [ ] V2 Factory & Pair contracts
- [ ] Basic router (V2 only)
- [ ] UST1 burn integration
- [ ] Unit tests for all contracts

#### Week 4-5: Tier System
- [ ] Tier Registry contract
- [ ] Tier calculation logic
- [ ] Fee discount implementation
- [ ] Integration tests

#### Week 6-7: Trading Wallet
- [ ] Trading Wallet contract
- [ ] Deposit/Withdraw logic
- [ ] Internal swap support
- [ ] Exit fee implementation

#### Week 8-10: Backend Foundation
- [ ] PostgreSQL schema deployment
- [ ] Indexer service (Rust)
- [ ] Basic REST API
- [ ] WebSocket server

### Phase 2: V3 & Frontend (8-10 weeks)

#### Week 11-14: V3 Pools
- [ ] V3 Factory contract
- [ ] V3 Pool with concentrated liquidity
- [ ] Position NFT contract
- [ ] Tick math library

#### Week 15-16: Omnirouter
- [ ] Multi-pool routing
- [ ] Split route support
- [ ] Gas optimization
- [ ] Route simulation

#### Week 17-20: Frontend
- [ ] Next.js application setup
- [ ] Wallet integration
- [ ] Swap interface
- [ ] Pool management UI
- [ ] Trading wallet UI
- [ ] Tier progress UI

### Phase 3: Polish & Launch (4-6 weeks)

#### Week 21-22: CoinGecko API
- [ ] All CoinGecko endpoints
- [ ] API documentation
- [ ] Rate limiting
- [ ] Testing with CoinGecko

#### Week 23-24: Analytics & Charts
- [ ] TradingView integration
- [ ] Burn statistics dashboard
- [ ] Volume/TVL tracking
- [ ] User analytics

#### Week 25-26: Security & Testing
- [ ] Security audit
- [ ] Bug bounty launch
- [ ] Testnet deployment
- [ ] Community testing
- [ ] Performance optimization

### Phase 4: Mainnet Launch

#### Pre-Launch
- [ ] Final audit review
- [ ] Emergency procedures documented
- [ ] Monitoring setup
- [ ] Documentation complete

#### Launch
- [ ] Mainnet contract deployment
- [ ] Initial liquidity provision
- [ ] Frontend deployment
- [ ] API public launch

#### Post-Launch
- [ ] Monitor and respond to issues
- [ ] Community feedback integration
- [ ] Performance tuning
- [ ] Feature iteration

---

## 12. Technical Specifications

### 12.1 Contract Addresses (Placeholder)

| Contract | Testnet | Mainnet |
|----------|---------|---------|
| V2 Factory | TBD | TBD |
| V3 Factory | TBD | TBD |
| Omnirouter | TBD | TBD |
| Trading Wallet | TBD | TBD |
| Tier Registry | TBD | TBD |

### 12.2 Configuration Parameters

```rust
// Default Configuration
pub const DEFAULT_CONFIG: Config = Config {
    // Fee Structure
    flat_burn_fee: Uint128::from(499900u128),        // 0.4999 UST1
    withdrawal_fee_bps: 299,                          // 2.99%
    
    // Trading Wallet
    trading_wallet_unlock_burn: Uint128::from(500_000000u128),  // 500 UST1
    
    // Tier Thresholds
    tier_1_burn: Uint128::from(5_000_000000u128),     // 5,000 UST1
    tier_2_burn: Uint128::from(50_000_000000u128),    // 50,000 UST1
    tier_3_burn: Uint128::from(150_000_000000u128),   // 150,000 UST1
    tier_4_burn: Uint128::from(500_000_000000u128),   // 500,000 UST1
    
    // Tier Discounts (basis points of original fee to charge)
    tier_1_multiplier_bps: 5000,   // 50% → 0.2499 UST1
    tier_2_multiplier_bps: 2400,   // 24% → 0.1199 UST1
    tier_3_multiplier_bps: 248,    // 2.48% → 0.0124 UST1
    tier_4_multiplier_bps: 24,     // 0.24% → 0.0012 UST1
    
    // V3 Pool
    v3_tick_spacings: [1, 10, 60, 200],
    
    // Safety
    max_slippage_bps: 5000,  // 50%
    min_liquidity: Uint128::from(1000u128),
};
```

### 12.3 Event Schemas

```rust
// Swap Event
#[derive(Serialize, Deserialize)]
pub struct SwapEvent {
    pub pool_address: String,
    pub sender: String,
    pub recipient: String,
    pub token_in: String,
    pub token_out: String,
    pub amount_in: String,
    pub amount_out: String,
    pub ust1_burned: String,
    pub is_trading_wallet: bool,
    pub user_tier: u8,
}

// Burn Event
#[derive(Serialize, Deserialize)]
pub struct BurnEvent {
    pub burner: String,
    pub amount: String,
    pub burn_type: String,  // "trade_fee", "withdrawal_fee", "tier_upgrade", "wallet_unlock"
    pub related_tx: Option<String>,
}

// Tier Upgrade Event
#[derive(Serialize, Deserialize)]
pub struct TierUpgradeEvent {
    pub user: String,
    pub previous_tier: u8,
    pub new_tier: u8,
    pub total_burned: String,
}
```

### 12.4 API Rate Limits

| Tier | Requests/Minute | WebSocket Connections |
|------|-----------------|----------------------|
| Public | 60 | 5 |
| Registered | 300 | 20 |
| Partner | 1000 | 100 |

---

## Appendix A: Economic Analysis

### A.1 UST1 Burn Projections

Assuming:
- 10,000 trades/day average
- Average trade value: $500
- 50% standard swaps, 50% trading wallet swaps
- Average tier: Bronze (0.2499 UST1 flat fee)

Daily Burn Estimate:
```
Flat fees: 10,000 trades × 0.2499 UST1 = 2,499 UST1
Exit fees: 5,000 trades × $500 × 2.99% × UST1_price = variable
Tier upgrades: ~10 users/day × avg 10,000 UST1 = 100,000 UST1
Wallet unlocks: ~5 users/day × 500 UST1 = 2,500 UST1

Conservative daily burn: ~105,000 UST1
Monthly burn: ~3.15M UST1
Annual burn: ~38.3M UST1
```

### A.2 LP Incentive Alternatives

Since LPs don't earn trading fees, alternative incentive mechanisms include:

1. **Governance Token Emissions**: Issue DEX governance token to LPs
2. **LUNC Staking Rewards**: Partner with validators for LP incentives
3. **Partner Token Incentives**: Protocol partnerships for incentive programs
4. **Community Pool Grants**: Propose LP incentives from Terra community pool

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **AMM** | Automated Market Maker - algorithm-based DEX |
| **Concentrated Liquidity** | V3 feature allowing LPs to provide liquidity in specific price ranges |
| **CW20** | CosmWasm token standard (similar to ERC-20) - the ONLY token type supported |
| **Flat Fee** | Fixed UST1 amount burned per trade |
| **Exit Fee** | Percentage fee applied when withdrawing from trading wallet |
| **Omnirouter** | Smart router that finds optimal trade paths across V2/V3 pools |
| **Tick** | Discrete price point in V3 pools |
| **Trading Wallet** | On-chain custodial wallet for fee-optimized trading |
| **TWAP** | Time-Weighted Average Price |
| **TVL** | Total Value Locked in liquidity pools |
| **UST1** | The CW20 fee token used for burns (NOT USTC - native USTC is not supported) |

---

## Appendix C: Token Support

### Supported Token Types

| Type | Supported | Notes |
|------|-----------|-------|
| CW20 Tokens | Yes | Full support for all CW20-compliant tokens |
| Native LUNC | **No** | Must be wrapped to CW20 (wLUNC) |
| Native USTC | **No** | Not supported - use UST1 (CW20) instead |
| IBC Tokens | **No** | Must be wrapped to CW20 |

### UST1 vs USTC

| Property | UST1 | USTC |
|----------|------|------|
| Token Type | CW20 | Native |
| Used for DEX Fees | **Yes** | No |
| Burned by DEX | **Yes** | No |
| Supported for Trading | Yes | No |

> **Important**: This DEX uses UST1 (a CW20 token) for all fee burns. Native USTC is NOT supported or used in any way.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-29 | - | Initial proposal |

---

*This document is a living proposal and subject to community feedback and governance decisions.*
