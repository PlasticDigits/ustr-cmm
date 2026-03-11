# TerraClassic Perpetual DEX Proposal: UST1-Backed Perp Exchange

## Executive Summary

A next-generation on-chain perpetual futures decentralized exchange for TerraClassic, designed with robust mechanisms to **combat toxic order flow**, implement **Auto-Deleveraging (ADL)** for solvency protection, and operate entirely with **CW20 tokens** backed by **UST1** as the settlement and collateral currency.

> **Important**: This Perp DEX exclusively supports **CW20 tokens only**. Native tokens (LUNC, USTC, etc.) are NOT supported. The collateral and settlement token is **UST1** (a CW20 token), not native USTC.

### Key Differentiators

- **Toxic Flow Protection**: Multi-layered defense against MEV, sandwich attacks, and predatory arbitrage
- **Optimized ADL System**: Fair, transparent auto-deleveraging with priority ranking
- **UST1-Backed Collateral**: All positions collateralized in UST1 stablecoin
- **Insurance Fund**: Protocol-owned fund to absorb liquidation shortfalls
- **Dynamic Funding Rates**: Hourly funding with volatility-adjusted calculations
- **CW20 Only**: No native token support—clean, predictable token handling
- **Tiered Fee Structure**: Integration with spot DEX tier system for fee discounts

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Toxic Flow Prevention](#2-toxic-flow-prevention)
3. [Position & Margin System](#3-position--margin-system)
4. [Liquidation Engine](#4-liquidation-engine)
5. [Auto-Deleveraging (ADL)](#5-auto-deleveraging-adl)
6. [Insurance Fund](#6-insurance-fund)
7. [Funding Rate Mechanism](#7-funding-rate-mechanism)
8. [Oracle System](#8-oracle-system)
9. [Smart Contract Design](#9-smart-contract-design)
10. [Risk Management](#10-risk-management)
11. [Fee Structure](#11-fee-structure)
12. [Backend Architecture](#12-backend-architecture)
13. [Frontend Design](#13-frontend-design)
14. [Security Considerations](#14-security-considerations)
15. [Implementation Phases](#15-implementation-phases)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React/Next.js)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Trading    │  │  Position   │  │  Portfolio  │  │   Leaderboard &     │ │
│  │  Terminal   │  │  Manager    │  │   Overview  │  │   Analytics         │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND SERVICES                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Order       │  │ Liquidation │  │   Funding   │  │  Oracle Aggregator  │ │
│  │ Matching    │  │   Monitor   │  │   Service   │  │     Service         │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                      │                                       │
│                         ┌────────────┴────────────┐                         │
│                         ▼                         ▼                         │
│                  ┌─────────────┐          ┌─────────────┐                   │
│                  │  PostgreSQL │          │    Redis    │                   │
│                  │  (History,  │          │  (Orderbook │                   │
│                  │   Funding)  │          │   Cache)    │                   │
│                  └─────────────┘          └─────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TERRACLASSIC BLOCKCHAIN                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         PERP CONTROLLER CONTRACT                      │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │  Order Execution │ Position Mgmt │ Liquidation │ ADL Engine    │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│         │              │                │               │                    │
│  ┌──────┴──────┐ ┌─────┴─────┐ ┌────────┴────────┐ ┌────┴────────┐         │
│  │   Market    │ │  Margin   │ │   Insurance     │ │   Oracle    │         │
│  │  Registry   │ │  Vault    │ │     Fund        │ │   Hub       │         │
│  └─────────────┘ └───────────┘ └─────────────────┘ └─────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Smart Contracts | CosmWasm (Rust) | Native TerraClassic support, CW20 standard |
| Order Matching | Hybrid (Off-chain matching, On-chain settlement) | Low latency, trustless settlement |
| Backend | Node.js + Rust | Performance for critical paths |
| Database | PostgreSQL + TimescaleDB | Time-series data for funding, charts |
| Cache | Redis | Real-time orderbook, rate limiting |
| Frontend | Next.js 14+ / React | SSR, real-time updates |
| Oracle | Multi-source aggregation | Redundancy, manipulation resistance |

### 1.3 Supported Markets (Initial)

| Market | Base Asset | Quote/Collateral | Max Leverage |
|--------|------------|------------------|--------------|
| wLUNC-PERP | wLUNC (CW20) | UST1 | 20x |
| wBTC-PERP | wBTC (CW20) | UST1 | 50x |
| wETH-PERP | wETH (CW20) | UST1 | 50x |
| wATOM-PERP | wATOM (CW20) | UST1 | 20x |

---

## 2. Toxic Flow Prevention

### 2.1 Understanding Toxic Order Flow

Toxic order flow refers to trades that systematically extract value from liquidity providers through:

1. **MEV Extraction**: Front-running, back-running, sandwich attacks
2. **Latency Arbitrage**: Exploiting stale prices before oracle updates
3. **Informed Trading**: Trading on information before it's public
4. **Liquidation Hunting**: Manipulating prices to trigger liquidations

### 2.2 Multi-Layered Defense Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TOXIC FLOW DEFENSE LAYERS                             │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ LAYER 1: FAIR ORDERING                                                  │ │
│  │ • Batch auction settlement (discrete time intervals)                    │ │
│  │ • Commit-reveal order submission                                        │ │
│  │ • Randomized execution within batches                                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ LAYER 2: PRICE PROTECTION                                               │ │
│  │ • TWAP oracle with manipulation resistance                              │ │
│  │ • Price band limits (max deviation per block)                           │ │
│  │ • Stale price rejection                                                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ LAYER 3: POSITION LIMITS                                                │ │
│  │ • Open interest caps per market                                         │ │
│  │ • Position size limits per account                                      │ │
│  │ • Concentration limits (max % of OI)                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ LAYER 4: FEE INCENTIVES                                                 │ │
│  │ • Asymmetric fees (takers pay more)                                     │ │
│  │ • Dynamic spread based on volatility                                    │ │
│  │ • Maker rebates funded by takers                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ LAYER 5: TIMING PROTECTION                                              │ │
│  │ • Minimum order lifetime before cancellation                            │ │
│  │ • Rate limiting on order submission/cancellation                        │ │
│  │ • Anti-spam measures                                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Batch Auction System

Instead of continuous order matching (which enables MEV), orders are collected and executed in discrete batches.

```rust
/// Batch auction configuration
pub struct BatchAuctionConfig {
    /// Duration of each batch period in seconds
    pub batch_duration_secs: u64,           // Default: 2 seconds
    /// Minimum time before order can be cancelled
    pub min_order_lifetime_secs: u64,       // Default: 1 second
    /// Maximum orders per batch per user
    pub max_orders_per_user_per_batch: u32, // Default: 10
}

/// Batch state
pub struct Batch {
    pub batch_id: u64,
    pub start_time: Timestamp,
    pub end_time: Timestamp,
    pub orders: Vec<Order>,
    pub status: BatchStatus,
}

pub enum BatchStatus {
    Collecting,     // Accepting orders
    Processing,     // Matching in progress
    Settled,        // All orders executed
}

/// Batch execution logic
impl BatchProcessor {
    pub fn execute_batch(&mut self, batch: &Batch) -> BatchResult {
        // 1. Shuffle orders randomly (verifiable randomness)
        let shuffled_orders = self.shuffle_with_vrf(&batch.orders);
        
        // 2. Calculate clearing price (uniform price auction)
        let clearing_price = self.calculate_clearing_price(&shuffled_orders);
        
        // 3. Execute all orders at clearing price
        let executions = self.execute_at_price(&shuffled_orders, clearing_price);
        
        // 4. Return unmatched orders to users
        self.return_unmatched(&executions);
        
        BatchResult {
            batch_id: batch.batch_id,
            clearing_price,
            executions,
            timestamp: env.block.time,
        }
    }
}
```

### 2.4 Commit-Reveal Order Submission

Prevents front-running by hiding order details until after commitment.

```rust
/// Phase 1: Commit (order details hidden)
pub struct OrderCommitment {
    pub commitment_hash: [u8; 32],  // Hash of order details + salt
    pub collateral_locked: Uint128, // UST1 locked for order
    pub commit_block: u64,
    pub reveal_deadline: u64,
}

/// Phase 2: Reveal (order details disclosed)
pub struct OrderReveal {
    pub commitment_id: u64,
    pub order: Order,
    pub salt: [u8; 32],
}

impl CommitRevealEngine {
    /// Commit phase: User submits hash of order
    pub fn commit_order(
        &mut self,
        sender: Addr,
        commitment_hash: [u8; 32],
        collateral: Uint128,
    ) -> Result<u64, ContractError> {
        // Lock collateral
        self.lock_collateral(&sender, collateral)?;
        
        // Store commitment
        let commitment_id = self.next_commitment_id();
        let commitment = OrderCommitment {
            commitment_hash,
            collateral_locked: collateral,
            commit_block: env.block.height,
            reveal_deadline: env.block.height + REVEAL_WINDOW_BLOCKS,
        };
        
        COMMITMENTS.save(deps.storage, commitment_id, &commitment)?;
        Ok(commitment_id)
    }
    
    /// Reveal phase: User reveals order details
    pub fn reveal_order(
        &mut self,
        sender: Addr,
        commitment_id: u64,
        order: Order,
        salt: [u8; 32],
    ) -> Result<(), ContractError> {
        let commitment = COMMITMENTS.load(deps.storage, commitment_id)?;
        
        // Verify reveal is within deadline
        if env.block.height > commitment.reveal_deadline {
            return Err(ContractError::RevealExpired {});
        }
        
        // Verify hash matches
        let computed_hash = self.compute_order_hash(&order, &salt);
        if computed_hash != commitment.commitment_hash {
            return Err(ContractError::HashMismatch {});
        }
        
        // Add order to current batch
        self.add_to_batch(order)?;
        
        Ok(())
    }
}
```

### 2.5 Dynamic Spread Mechanism

Spreads widen during high volatility to protect against toxic flow.

```rust
/// Dynamic spread calculation
pub struct SpreadConfig {
    pub base_spread_bps: u16,           // Minimum spread: 5 bps (0.05%)
    pub volatility_multiplier: Decimal, // How much volatility affects spread
    pub max_spread_bps: u16,            // Maximum spread: 50 bps (0.5%)
}

impl SpreadCalculator {
    pub fn calculate_spread(&self, market: &Market) -> Decimal {
        // Get recent volatility (e.g., 5-minute realized vol)
        let volatility = self.get_recent_volatility(market);
        
        // Base spread + volatility component
        let spread = Decimal::from_ratio(self.config.base_spread_bps, 10000u128)
            + volatility * self.config.volatility_multiplier;
        
        // Cap at maximum
        let max_spread = Decimal::from_ratio(self.config.max_spread_bps, 10000u128);
        spread.min(max_spread)
    }
    
    /// Adjust mark price with spread for orders
    pub fn get_execution_price(
        &self,
        mark_price: Decimal,
        order_side: Side,
        market: &Market,
    ) -> Decimal {
        let spread = self.calculate_spread(market);
        
        match order_side {
            Side::Long => mark_price * (Decimal::one() + spread), // Pay higher for longs
            Side::Short => mark_price * (Decimal::one() - spread), // Receive lower for shorts
        }
    }
}
```

### 2.6 Rate Limiting & Anti-Spam

```rust
/// Rate limit configuration per account
pub struct RateLimitConfig {
    /// Maximum orders per minute
    pub max_orders_per_minute: u32,         // Default: 60
    /// Maximum cancellations per minute
    pub max_cancels_per_minute: u32,        // Default: 30
    /// Minimum time between orders (ms)
    pub min_order_interval_ms: u64,         // Default: 100ms
    /// Penalty for excessive activity
    pub spam_penalty_duration_secs: u64,    // Default: 60 seconds
}

/// Rate limiter state
pub struct AccountRateLimiter {
    pub orders_this_minute: u32,
    pub cancels_this_minute: u32,
    pub last_order_time: Timestamp,
    pub penalty_until: Option<Timestamp>,
}

impl RateLimiter {
    pub fn check_and_update(
        &mut self,
        account: &Addr,
        action: RateLimitAction,
    ) -> Result<(), ContractError> {
        let limiter = self.get_account_limiter(account)?;
        
        // Check if in penalty period
        if let Some(penalty_until) = limiter.penalty_until {
            if env.block.time < penalty_until {
                return Err(ContractError::RateLimitPenalty {
                    until: penalty_until,
                });
            }
        }
        
        match action {
            RateLimitAction::Order => {
                if limiter.orders_this_minute >= self.config.max_orders_per_minute {
                    self.apply_penalty(account)?;
                    return Err(ContractError::TooManyOrders {});
                }
                limiter.orders_this_minute += 1;
            }
            RateLimitAction::Cancel => {
                if limiter.cancels_this_minute >= self.config.max_cancels_per_minute {
                    self.apply_penalty(account)?;
                    return Err(ContractError::TooManyCancels {});
                }
                limiter.cancels_this_minute += 1;
            }
        }
        
        Ok(())
    }
}
```

---

## 3. Position & Margin System

### 3.1 Position Structure

```rust
/// Perpetual position
pub struct Position {
    pub owner: Addr,
    pub market_id: u32,
    pub side: Side,                     // Long or Short
    pub size: Uint128,                  // Position size in base asset
    pub entry_price: Decimal,           // Average entry price
    pub margin: Uint128,                // UST1 collateral
    pub leverage: Decimal,              // Current leverage
    pub unrealized_pnl: SignedDecimal,  // Current unrealized P&L
    pub realized_pnl: SignedDecimal,    // Accumulated realized P&L
    pub last_funding_time: Timestamp,   // Last funding payment
    pub accumulated_funding: SignedDecimal, // Total funding paid/received
    pub opened_at: Timestamp,
    pub last_updated: Timestamp,
}

#[derive(Clone, Copy)]
pub enum Side {
    Long,
    Short,
}

/// Signed decimal for P&L (can be negative)
pub struct SignedDecimal {
    pub value: Decimal,
    pub is_negative: bool,
}
```

### 3.2 Margin Types

```rust
/// Margin mode configuration
pub enum MarginMode {
    /// Each position has its own margin (isolated risk)
    Isolated,
    /// All positions share margin pool (capital efficient)
    Cross,
}

/// Cross-margin account
pub struct CrossMarginAccount {
    pub owner: Addr,
    pub total_margin: Uint128,          // Total UST1 deposited
    pub positions: Vec<Position>,       // All open positions
    pub unrealized_pnl: SignedDecimal,  // Sum of all positions' PnL
    pub available_margin: Uint128,      // Margin available for new positions
    pub maintenance_margin: Uint128,    // Minimum margin required
    pub margin_ratio: Decimal,          // Current margin ratio
}

impl CrossMarginAccount {
    /// Calculate account health
    pub fn calculate_margin_ratio(&self, oracle: &OracleHub) -> Decimal {
        let total_position_value = self.positions.iter()
            .map(|p| p.notional_value(oracle))
            .sum::<Uint128>();
        
        let equity = self.total_margin.checked_add_signed(self.unrealized_pnl)?;
        
        if total_position_value.is_zero() {
            return Decimal::MAX;
        }
        
        Decimal::from_ratio(equity, total_position_value)
    }
    
    /// Check if account is liquidatable
    pub fn is_liquidatable(&self, market_config: &MarketConfig) -> bool {
        self.margin_ratio < market_config.maintenance_margin_ratio
    }
}
```

### 3.3 Leverage Tiers

Maximum leverage decreases with position size to limit systemic risk.

```rust
/// Leverage tier configuration
pub struct LeverageTier {
    pub max_position_notional: Uint128, // Maximum position size for this tier
    pub max_leverage: Decimal,          // Maximum leverage allowed
    pub maintenance_margin_bps: u16,    // Maintenance margin in basis points
}

/// Default leverage tiers for major markets (wBTC, wETH)
pub fn default_leverage_tiers() -> Vec<LeverageTier> {
    vec![
        LeverageTier {
            max_position_notional: Uint128::from(10_000_000000u128),  // $10,000
            max_leverage: Decimal::from_ratio(50u128, 1u128),          // 50x
            maintenance_margin_bps: 50,                                 // 0.5%
        },
        LeverageTier {
            max_position_notional: Uint128::from(100_000_000000u128), // $100,000
            max_leverage: Decimal::from_ratio(25u128, 1u128),          // 25x
            maintenance_margin_bps: 100,                                // 1%
        },
        LeverageTier {
            max_position_notional: Uint128::from(500_000_000000u128), // $500,000
            max_leverage: Decimal::from_ratio(10u128, 1u128),          // 10x
            maintenance_margin_bps: 250,                                // 2.5%
        },
        LeverageTier {
            max_position_notional: Uint128::from(1_000_000_000000u128), // $1,000,000
            max_leverage: Decimal::from_ratio(5u128, 1u128),            // 5x
            maintenance_margin_bps: 500,                                 // 5%
        },
    ]
}
```

---

## 4. Liquidation Engine

### 4.1 Liquidation Process Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LIQUIDATION PROCESS FLOW                             │
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Monitor   │───▶│   Trigger   │───▶│   Execute   │───▶│   Settle    │  │
│  │   Health    │    │ Liquidation │    │ Liquidation │    │   Result    │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│        │                  │                  │                  │           │
│        ▼                  ▼                  ▼                  ▼           │
│  Margin Ratio      Margin < MMR        Close Position      Update State    │
│  < Maintenance     Check confirmed     at Mark Price        - Insurance    │
│                                        + Spread             - User margin  │
│                                                             - ADL if needed│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Liquidation Types

```rust
/// Liquidation outcome
pub enum LiquidationResult {
    /// Position closed with remaining margin returned to user
    FullLiquidation {
        position_id: u64,
        closed_size: Uint128,
        execution_price: Decimal,
        margin_returned: Uint128,
        liquidation_fee: Uint128,
        insurance_fund_contribution: Uint128,
    },
    /// Position partially closed to restore health
    PartialLiquidation {
        position_id: u64,
        closed_size: Uint128,
        remaining_size: Uint128,
        execution_price: Decimal,
        margin_deducted: Uint128,
        liquidation_fee: Uint128,
    },
    /// Account insolvent, requires ADL
    Bankruptcy {
        position_id: u64,
        shortfall: Uint128,
        requires_adl: bool,
    },
}

/// Liquidation configuration
pub struct LiquidationConfig {
    /// Margin ratio that triggers liquidation (e.g., 0.625% = 160x effective leverage)
    pub liquidation_margin_ratio: Decimal,
    /// Fee paid to liquidator (e.g., 0.5% of position)
    pub liquidator_fee_bps: u16,
    /// Fee sent to insurance fund (e.g., 0.5% of position)
    pub insurance_fund_fee_bps: u16,
    /// Maximum liquidation spread from mark price
    pub max_liquidation_spread_bps: u16,
    /// Partial liquidation threshold (close 50% if above)
    pub partial_liquidation_threshold: Decimal,
}
```

### 4.3 Liquidation Execution

```rust
impl LiquidationEngine {
    /// Execute liquidation for an underwater position
    pub fn liquidate(
        &mut self,
        deps: DepsMut,
        env: Env,
        position_id: u64,
        liquidator: Addr,
    ) -> Result<LiquidationResult, ContractError> {
        let position = POSITIONS.load(deps.storage, position_id)?;
        let market = MARKETS.load(deps.storage, position.market_id)?;
        
        // 1. Verify position is liquidatable
        let margin_ratio = self.calculate_margin_ratio(&position, &market)?;
        if margin_ratio >= market.config.liquidation_margin_ratio {
            return Err(ContractError::PositionNotLiquidatable {
                margin_ratio,
                required: market.config.liquidation_margin_ratio,
            });
        }
        
        // 2. Calculate liquidation price with spread
        let mark_price = self.oracle.get_mark_price(market.id)?;
        let liquidation_price = self.calculate_liquidation_price(
            mark_price,
            position.side,
            market.config.max_liquidation_spread_bps,
        );
        
        // 3. Determine liquidation size (partial vs full)
        let (close_size, is_partial) = self.determine_liquidation_size(
            &position,
            margin_ratio,
            &market.config,
        );
        
        // 4. Calculate fees
        let notional_closed = close_size * liquidation_price;
        let liquidator_fee = notional_closed.multiply_ratio(
            market.config.liquidator_fee_bps,
            10000u128,
        );
        let insurance_fee = notional_closed.multiply_ratio(
            market.config.insurance_fund_fee_bps,
            10000u128,
        );
        
        // 5. Calculate P&L and remaining margin
        let pnl = self.calculate_pnl(&position, liquidation_price, close_size);
        let margin_after = position.margin
            .checked_add_signed(pnl)?
            .checked_sub(liquidator_fee)?
            .checked_sub(insurance_fee)?;
        
        // 6. Handle result based on solvency
        if margin_after < Uint128::zero() {
            // Insolvent - attempt to cover from insurance fund
            let shortfall = Uint128::zero().checked_sub(margin_after)?;
            let covered = self.insurance_fund.cover_shortfall(shortfall)?;
            
            if covered < shortfall {
                // Insurance fund insufficient - trigger ADL
                return Ok(LiquidationResult::Bankruptcy {
                    position_id,
                    shortfall: shortfall - covered,
                    requires_adl: true,
                });
            }
        }
        
        // 7. Execute the liquidation
        self.close_position(position_id, close_size, liquidation_price)?;
        
        // 8. Pay liquidator and insurance fund
        self.pay_liquidator(&liquidator, liquidator_fee)?;
        self.fund_insurance(insurance_fee)?;
        
        // 9. Return remaining margin to user (if any)
        if margin_after > Uint128::zero() {
            self.return_margin(&position.owner, margin_after)?;
        }
        
        Ok(if is_partial {
            LiquidationResult::PartialLiquidation { /* ... */ }
        } else {
            LiquidationResult::FullLiquidation { /* ... */ }
        })
    }
}
```

### 4.4 Keeper Incentives

Liquidators (keepers) are incentivized to monitor and execute liquidations.

```rust
/// Keeper reward structure
pub struct KeeperRewards {
    /// Base reward per successful liquidation
    pub base_reward: Uint128,               // e.g., 10 UST1
    /// Percentage of position value
    pub position_fee_bps: u16,              // e.g., 50 bps (0.5%)
    /// Bonus for liquidating large positions
    pub large_position_bonus_bps: u16,      // e.g., 25 bps extra above $100k
    /// Gas rebate (estimated gas cost in UST1)
    pub gas_rebate: Uint128,                // e.g., 0.5 UST1
}

impl KeeperRewards {
    pub fn calculate_reward(
        &self,
        position_notional: Uint128,
    ) -> Uint128 {
        let base = self.base_reward;
        let position_fee = position_notional.multiply_ratio(self.position_fee_bps, 10000u128);
        
        let large_bonus = if position_notional > Uint128::from(100_000_000000u128) {
            position_notional.multiply_ratio(self.large_position_bonus_bps, 10000u128)
        } else {
            Uint128::zero()
        };
        
        base + position_fee + large_bonus + self.gas_rebate
    }
}
```

---

## 5. Auto-Deleveraging (ADL)

### 5.1 ADL Overview

Auto-Deleveraging is a **last-resort mechanism** triggered when:
1. A position is liquidated at a loss exceeding its margin
2. The Insurance Fund cannot cover the shortfall
3. Bad debt would otherwise accumulate in the system

ADL forcibly closes profitable counter-positions to absorb the loss.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ADL TRIGGER CONDITIONS                             │
│                                                                              │
│  Bankrupt Position (Long)           Opposite Positions (Shorts)             │
│  ┌─────────────────────┐            ┌─────────────────────────────────┐     │
│  │ Size: 100 wBTC      │            │ Profitable shorts ranked by:    │     │
│  │ Loss: $50,000       │            │ 1. Profit % (highest first)     │     │
│  │ Margin: $40,000     │────ADL────▶│ 2. Leverage (highest first)     │     │
│  │ Shortfall: $10,000  │            │                                 │     │
│  │                     │            │ Top-ranked shorts deleveraged   │     │
│  └─────────────────────┘            │ until shortfall covered         │     │
│                                     └─────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 ADL Priority Ranking

The ADL system ranks opposite-side positions to determine who gets deleveraged first.

```rust
/// ADL ranking score calculation
pub struct AdlRanking {
    pub position_id: u64,
    pub owner: Addr,
    pub rank_score: Decimal,        // Higher score = deleveraged first
    pub profit_ratio: Decimal,      // Unrealized profit / margin
    pub effective_leverage: Decimal,
}

impl AdlEngine {
    /// Calculate ADL priority score
    /// Higher score = gets deleveraged first
    /// Score = profit_ratio * leverage_factor
    pub fn calculate_rank_score(&self, position: &Position, mark_price: Decimal) -> Decimal {
        // Calculate profit ratio (unrealized PnL / margin)
        let pnl = self.calculate_unrealized_pnl(position, mark_price);
        let profit_ratio = if pnl.is_negative {
            Decimal::zero() // Losing positions have lowest priority
        } else {
            Decimal::from_ratio(pnl.value, position.margin)
        };
        
        // Calculate effective leverage
        let notional = position.size * mark_price;
        let effective_leverage = Decimal::from_ratio(notional, position.margin);
        
        // Rank score = profit_ratio * sqrt(leverage)
        // This prioritizes highly profitable, highly leveraged positions
        profit_ratio * effective_leverage.sqrt()
    }
    
    /// Get ranked list of positions for ADL
    pub fn get_adl_queue(
        &self,
        deps: Deps,
        market_id: u32,
        side: Side,  // Opposite side of bankrupt position
    ) -> Vec<AdlRanking> {
        let opposite_side = side.opposite();
        
        // Get all positions on opposite side
        let positions: Vec<Position> = POSITIONS
            .idx
            .market_side
            .prefix((market_id, opposite_side))
            .range(deps.storage, None, None, Order::Ascending)
            .filter_map(|r| r.ok())
            .collect();
        
        let mark_price = self.oracle.get_mark_price(market_id)?;
        
        // Calculate and sort by rank score
        let mut rankings: Vec<AdlRanking> = positions
            .iter()
            .filter(|p| self.calculate_unrealized_pnl(p, mark_price).is_positive())
            .map(|p| AdlRanking {
                position_id: p.id,
                owner: p.owner.clone(),
                rank_score: self.calculate_rank_score(p, mark_price),
                profit_ratio: self.calculate_profit_ratio(p, mark_price),
                effective_leverage: self.calculate_leverage(p, mark_price),
            })
            .collect();
        
        // Sort descending by rank score
        rankings.sort_by(|a, b| b.rank_score.cmp(&a.rank_score));
        
        rankings
    }
}
```

### 5.3 ADL Execution

```rust
impl AdlEngine {
    /// Execute ADL to cover bankruptcy shortfall
    pub fn execute_adl(
        &mut self,
        deps: DepsMut,
        env: Env,
        bankrupt_position: &Position,
        shortfall: Uint128,
    ) -> Result<AdlResult, ContractError> {
        let market = MARKETS.load(deps.storage, bankrupt_position.market_id)?;
        let mark_price = self.oracle.get_mark_price(market.id)?;
        
        // Get ADL queue (opposite side positions, ranked)
        let adl_queue = self.get_adl_queue(
            deps.as_ref(),
            market.id,
            bankrupt_position.side,
        );
        
        if adl_queue.is_empty() {
            return Err(ContractError::NoAdlCandidates {});
        }
        
        let mut remaining_shortfall = shortfall;
        let mut deleveraged_positions: Vec<DeleverageEvent> = vec![];
        
        // Deleverage positions until shortfall is covered
        for ranking in adl_queue {
            if remaining_shortfall.is_zero() {
                break;
            }
            
            let position = POSITIONS.load(deps.storage, ranking.position_id)?;
            
            // Calculate how much of this position to close
            let position_value = position.size * mark_price;
            let pnl = self.calculate_unrealized_pnl(&position, mark_price);
            
            // Close enough to cover shortfall (or entire position)
            let close_ratio = if pnl.value >= remaining_shortfall {
                Decimal::from_ratio(remaining_shortfall, pnl.value)
            } else {
                Decimal::one()
            };
            
            let close_size = position.size * close_ratio;
            let absorbed_amount = pnl.value.min(remaining_shortfall);
            
            // Execute the deleveraging
            self.deleverage_position(
                deps.branch(),
                &position,
                close_size,
                mark_price,
                absorbed_amount,
            )?;
            
            remaining_shortfall = remaining_shortfall.saturating_sub(absorbed_amount);
            
            deleveraged_positions.push(DeleverageEvent {
                position_id: ranking.position_id,
                owner: ranking.owner,
                closed_size: close_size,
                execution_price: mark_price,
                profit_absorbed: absorbed_amount,
            });
        }
        
        // Emit ADL events
        self.emit_adl_events(&deleveraged_positions)?;
        
        Ok(AdlResult {
            bankrupt_position_id: bankrupt_position.id,
            total_shortfall: shortfall,
            covered_amount: shortfall - remaining_shortfall,
            remaining_bad_debt: remaining_shortfall,
            deleveraged_positions,
        })
    }
}

/// ADL result structure
pub struct AdlResult {
    pub bankrupt_position_id: u64,
    pub total_shortfall: Uint128,
    pub covered_amount: Uint128,
    pub remaining_bad_debt: Uint128,
    pub deleveraged_positions: Vec<DeleverageEvent>,
}

pub struct DeleverageEvent {
    pub position_id: u64,
    pub owner: Addr,
    pub closed_size: Uint128,
    pub execution_price: Decimal,
    pub profit_absorbed: Uint128,
}
```

### 5.4 ADL Indicator

Users see their ADL risk in real-time.

```rust
/// ADL indicator levels (1-5, higher = more risk)
pub fn calculate_adl_indicator(ranking: &AdlRanking, queue: &[AdlRanking]) -> u8 {
    if queue.is_empty() {
        return 0;
    }
    
    // Find position in queue
    let position_in_queue = queue.iter()
        .position(|r| r.position_id == ranking.position_id)
        .unwrap_or(queue.len());
    
    // Calculate percentile (0-100)
    let percentile = (position_in_queue as f64 / queue.len() as f64) * 100.0;
    
    // Map to indicator level (1-5)
    match percentile as u32 {
        0..=20 => 5,    // Top 20% - highest risk
        21..=40 => 4,
        41..=60 => 3,
        61..=80 => 2,
        _ => 1,         // Bottom 20% - lowest risk
    }
}
```

### 5.5 ADL Fairness Guarantees

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ADL FAIRNESS PRINCIPLES                               │
│                                                                              │
│  1. PROFIT-BASED PRIORITY                                                   │
│     - Only profitable positions are deleveraged                             │
│     - Higher profit ratio = higher priority                                 │
│     - Losing positions are never ADL'd                                      │
│                                                                              │
│  2. LEVERAGE-WEIGHTED                                                       │
│     - Higher leverage positions deleveraged first                           │
│     - Encourages conservative leverage                                      │
│                                                                              │
│  3. TRANSPARENT RANKING                                                     │
│     - On-chain verifiable ranking algorithm                                 │
│     - Real-time ADL indicator for all users                                 │
│                                                                              │
│  4. FAIR EXECUTION PRICE                                                    │
│     - ADL executes at mark price (no slippage)                              │
│     - No additional penalty beyond profit reduction                         │
│                                                                              │
│  5. LAST RESORT ONLY                                                        │
│     - Only triggered when insurance fund depleted                           │
│     - Regular liquidations preferred                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Insurance Fund

### 6.1 Insurance Fund Purpose

The Insurance Fund serves as the primary buffer against socialized losses:

1. **Covers liquidation shortfalls** when margin < losses
2. **Prevents ADL** in most market conditions
3. **Absorbs funding payment imbalances**
4. **Backstops oracle failures**

### 6.2 Insurance Fund Structure

```rust
/// Insurance Fund contract
pub struct InsuranceFund {
    pub balance: Uint128,           // Total UST1 in fund
    pub target_ratio: Decimal,      // Target size as % of OI (e.g., 5%)
    pub min_balance: Uint128,       // Minimum balance to maintain
    pub staking_enabled: bool,      // Whether IF staking is active
    pub staked_amount: Uint128,     // UST1 staked by users
    pub pending_claims: Uint128,    // Pending withdrawal claims
    pub last_contribution: Timestamp,
}

/// Insurance Fund staking position
pub struct IfStakingPosition {
    pub owner: Addr,
    pub staked_amount: Uint128,
    pub share_amount: Uint128,      // Shares of the IF pool
    pub staked_at: Timestamp,
    pub lockup_until: Timestamp,    // Minimum lockup period
}

/// Insurance Fund configuration
pub struct InsuranceFundConfig {
    /// Target fund size as ratio of total open interest
    pub target_oi_ratio: Decimal,           // e.g., 0.05 (5%)
    /// Minimum fund balance in UST1
    pub min_balance: Uint128,               // e.g., 100,000 UST1
    /// Share of liquidation fees going to fund
    pub liquidation_fee_share_bps: u16,     // e.g., 5000 (50%)
    /// Share of trading fees going to fund
    pub trading_fee_share_bps: u16,         // e.g., 1000 (10%)
    /// Minimum staking lockup period
    pub staking_lockup_secs: u64,           // e.g., 7 days
    /// APY for IF stakers when fund is healthy
    pub base_staking_apy_bps: u16,          // e.g., 500 (5%)
}
```

### 6.3 Insurance Fund Revenue Sources

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INSURANCE FUND REVENUE SOURCES                          │
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │ LIQUIDATION FEES    │  │  TRADING FEES       │  │   FUNDING SURPLUS   │  │
│  │                     │  │                     │  │                     │  │
│  │ 50% of liquidation  │  │ 10% of all trading  │  │ When longs > shorts │  │
│  │ penalties go to IF  │  │ fees to IF          │  │ or vice versa,      │  │
│  │                     │  │                     │  │ surplus to IF       │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  │
│            │                        │                        │               │
│            └────────────────────────┴────────────────────────┘               │
│                                     │                                        │
│                                     ▼                                        │
│                          ┌─────────────────────┐                            │
│                          │   INSURANCE FUND    │                            │
│                          │                     │                            │
│                          │ Target: 5% of OI    │                            │
│                          │ Min: 100,000 UST1   │                            │
│                          └─────────────────────┘                            │
│                                     │                                        │
│                    ┌────────────────┴────────────────┐                      │
│                    ▼                                 ▼                      │
│         ┌─────────────────────┐          ┌─────────────────────┐           │
│         │ COVER SHORTFALLS   │          │  STAKER REWARDS      │           │
│         │                     │          │                     │           │
│         │ Liquidation losses  │          │ APY paid to IF      │           │
│         │ that exceed margin  │          │ stakers from fees   │           │
│         └─────────────────────┘          └─────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Insurance Fund Operations

```rust
impl InsuranceFund {
    /// Attempt to cover a liquidation shortfall
    pub fn cover_shortfall(
        &mut self,
        deps: DepsMut,
        shortfall: Uint128,
    ) -> Result<Uint128, ContractError> {
        // Calculate available balance (excluding staker withdrawals)
        let available = self.balance.saturating_sub(self.pending_claims);
        
        // Cover as much as possible
        let covered = available.min(shortfall);
        
        if covered > Uint128::zero() {
            self.balance = self.balance.saturating_sub(covered);
            
            // Emit event
            self.emit_shortfall_covered(shortfall, covered)?;
        }
        
        Ok(covered)
    }
    
    /// Add funds from fee revenue
    pub fn add_funds(
        &mut self,
        deps: DepsMut,
        amount: Uint128,
        source: FundingSource,
    ) -> Result<(), ContractError> {
        self.balance = self.balance.checked_add(amount)?;
        self.last_contribution = env.block.time;
        
        self.emit_funds_added(amount, source)?;
        
        Ok(())
    }
    
    /// Stake UST1 to the insurance fund
    pub fn stake(
        &mut self,
        deps: DepsMut,
        env: Env,
        staker: Addr,
        amount: Uint128,
    ) -> Result<(), ContractError> {
        // Calculate shares based on current fund value
        let total_shares = self.get_total_shares(deps.as_ref())?;
        let total_value = self.balance + self.staked_amount;
        
        let shares = if total_shares.is_zero() {
            amount // 1:1 for first staker
        } else {
            amount.multiply_ratio(total_shares, total_value)
        };
        
        // Create or update staking position
        let position = IfStakingPosition {
            owner: staker.clone(),
            staked_amount: amount,
            share_amount: shares,
            staked_at: env.block.time,
            lockup_until: env.block.time.plus_seconds(self.config.staking_lockup_secs),
        };
        
        IF_STAKING_POSITIONS.save(deps.storage, &staker, &position)?;
        
        self.staked_amount = self.staked_amount.checked_add(amount)?;
        self.balance = self.balance.checked_add(amount)?;
        
        Ok(())
    }
    
    /// Calculate current fund health
    pub fn health_ratio(&self, total_oi: Uint128) -> Decimal {
        if total_oi.is_zero() {
            return Decimal::MAX;
        }
        
        Decimal::from_ratio(self.balance, total_oi)
    }
    
    /// Check if fund is healthy
    pub fn is_healthy(&self, total_oi: Uint128) -> bool {
        self.health_ratio(total_oi) >= self.config.target_oi_ratio
    }
}
```

---

## 7. Funding Rate Mechanism

### 7.1 Funding Rate Purpose

Funding rates keep perpetual prices anchored to spot prices by creating periodic payments between longs and shorts.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FUNDING RATE MECHANISM                              │
│                                                                              │
│  Perp Price > Spot Price (Premium)      Perp Price < Spot Price (Discount) │
│  ┌───────────────────────────┐          ┌───────────────────────────┐       │
│  │   LONGS PAY SHORTS        │          │   SHORTS PAY LONGS        │       │
│  │                           │          │                           │       │
│  │   Incentivizes:           │          │   Incentivizes:           │       │
│  │   - Longs to close        │          │   - Shorts to close       │       │
│  │   - New shorts to open    │          │   - New longs to open     │       │
│  │                           │          │                           │       │
│  │   Result: Price drops     │          │   Result: Price rises     │       │
│  └───────────────────────────┘          └───────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Funding Rate Calculation

```rust
/// Funding rate configuration
pub struct FundingConfig {
    /// Funding interval in seconds (default: 1 hour)
    pub funding_interval_secs: u64,
    /// Maximum funding rate per interval (default: 0.1% = 10 bps)
    pub max_funding_rate_bps: u16,
    /// Minimum funding rate per interval (can be negative)
    pub min_funding_rate_bps: i16,
    /// Dampening factor for rate calculation
    pub dampening_factor: Decimal,
    /// Interest rate component (annualized)
    pub interest_rate_bps: u16,
}

/// Funding rate calculation
impl FundingEngine {
    /// Calculate current funding rate
    pub fn calculate_funding_rate(
        &self,
        market: &Market,
        oracle: &OracleHub,
    ) -> Result<SignedDecimal, ContractError> {
        // Get prices
        let mark_price = self.get_mark_price(market)?;
        let index_price = oracle.get_index_price(market.id)?;
        
        // Calculate premium/discount
        // Premium = (Mark - Index) / Index
        let premium = if mark_price > index_price {
            SignedDecimal::positive(
                Decimal::from_ratio(mark_price - index_price, index_price)
            )
        } else {
            SignedDecimal::negative(
                Decimal::from_ratio(index_price - mark_price, index_price)
            )
        };
        
        // Apply dampening (to prevent extreme swings)
        let dampened_premium = premium * self.config.dampening_factor;
        
        // Add interest rate component
        // Interest = (Quote Rate - Base Rate) / Funding Intervals Per Day
        let intervals_per_day = 86400 / self.config.funding_interval_secs;
        let interest_per_interval = Decimal::from_ratio(
            self.config.interest_rate_bps,
            10000 * intervals_per_day as u128,
        );
        
        // Final funding rate = Premium + Interest
        let funding_rate = dampened_premium + SignedDecimal::positive(interest_per_interval);
        
        // Clamp to min/max
        self.clamp_funding_rate(funding_rate)
    }
    
    /// Apply funding payments to all positions
    pub fn apply_funding(
        &mut self,
        deps: DepsMut,
        env: Env,
        market_id: u32,
    ) -> Result<FundingResult, ContractError> {
        let market = MARKETS.load(deps.storage, market_id)?;
        let funding_rate = self.calculate_funding_rate(&market, &self.oracle)?;
        
        // Get total long and short open interest
        let long_oi = market.long_open_interest;
        let short_oi = market.short_open_interest;
        
        // Calculate total funding payment
        // Funding Payment = Position Size * Mark Price * Funding Rate
        let mark_price = self.get_mark_price(&market)?;
        
        let long_payment = long_oi * mark_price * funding_rate.abs();
        let short_payment = short_oi * mark_price * funding_rate.abs();
        
        // Determine direction and handle imbalance
        let (payer_side, receiver_side, payment_amount, received_amount) = 
            if funding_rate.is_positive() {
                // Longs pay shorts
                let payment = long_payment;
                let received = payment.min(short_payment); // Can't receive more than paid
                (Side::Long, Side::Short, payment, received)
            } else {
                // Shorts pay longs
                let payment = short_payment;
                let received = payment.min(long_payment);
                (Side::Short, Side::Long, payment, received)
            };
        
        // Handle OI imbalance (surplus goes to insurance fund)
        let surplus = payment_amount.saturating_sub(received_amount);
        if surplus > Uint128::zero() {
            self.insurance_fund.add_funds(surplus, FundingSource::FundingSurplus)?;
        }
        
        // Update all positions
        self.update_position_funding(deps.branch(), market_id, funding_rate)?;
        
        // Record funding history
        FUNDING_HISTORY.save(
            deps.storage,
            (market_id, env.block.time.seconds()),
            &FundingRecord {
                rate: funding_rate,
                mark_price,
                index_price: self.oracle.get_index_price(market_id)?,
                long_oi,
                short_oi,
                timestamp: env.block.time,
            },
        )?;
        
        Ok(FundingResult {
            market_id,
            funding_rate,
            total_paid: payment_amount,
            total_received: received_amount,
            insurance_surplus: surplus,
        })
    }
}
```

### 7.3 Funding Rate Display

```rust
/// Funding rate info for frontend
pub struct FundingInfo {
    pub current_rate: SignedDecimal,        // Current hourly rate
    pub predicted_rate: SignedDecimal,      // Predicted next rate
    pub annualized_rate: SignedDecimal,     // Rate * 8760 (hours/year)
    pub next_funding_time: Timestamp,       // When next funding occurs
    pub countdown_secs: u64,                // Seconds until next funding
    pub long_pays: bool,                    // True if longs are paying
}
```

---

## 8. Oracle System

### 8.1 Oracle Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ORACLE HUB                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    PRICE AGGREGATION LAYER                           │   │
│  │                                                                      │   │
│  │   Source 1      Source 2      Source 3      Source 4      Source 5  │   │
│  │   (Pyth)        (Band)        (Chainlink)   (Internal)   (TWAP)     │   │
│  │      │             │             │             │             │       │   │
│  │      └─────────────┴─────────────┴─────────────┴─────────────┘       │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │                    ┌─────────────────┐                              │   │
│  │                    │ MEDIAN FILTER   │                              │   │
│  │                    │ (Remove outliers│                              │   │
│  │                    │  >2% deviation) │                              │   │
│  │                    └─────────────────┘                              │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │                    ┌─────────────────┐                              │   │
│  │                    │  VALIDATION     │                              │   │
│  │                    │ - Freshness     │                              │   │
│  │                    │ - Min sources   │                              │   │
│  │                    │ - Price bands   │                              │   │
│  │                    └─────────────────┘                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       PRICE OUTPUTS                                  │   │
│  │                                                                      │   │
│  │   Index Price           Mark Price            TWAP                  │   │
│  │   (Spot Reference)      (Fair Value)          (Time-Weighted)       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Oracle Contract Design

```rust
/// Oracle Hub configuration
pub struct OracleHubConfig {
    pub owner: Addr,
    pub min_sources: u8,                    // Minimum oracle sources required
    pub max_price_age_secs: u64,            // Maximum age of price data
    pub max_deviation_bps: u16,             // Max deviation between sources
    pub twap_window_secs: u64,              // TWAP calculation window
}

/// Price source
pub struct PriceSource {
    pub source_id: String,
    pub source_type: SourceType,
    pub contract_addr: Option<Addr>,        // For on-chain oracles
    pub weight: u16,                        // Weight in aggregation (bps)
    pub is_active: bool,
}

pub enum SourceType {
    Pyth,
    Band,
    Chainlink,
    InternalTwap,
    SpotDexPool,
}

/// Aggregated price data
pub struct AggregatedPrice {
    pub price: Decimal,
    pub timestamp: Timestamp,
    pub sources_used: u8,
    pub confidence: Decimal,                // Confidence interval
    pub is_valid: bool,
}

impl OracleHub {
    /// Get aggregated index price (spot reference)
    pub fn get_index_price(&self, asset_id: u32) -> Result<Decimal, ContractError> {
        let sources = self.get_active_sources(asset_id)?;
        
        if sources.len() < self.config.min_sources as usize {
            return Err(ContractError::InsufficientOracleSources {
                required: self.config.min_sources,
                available: sources.len() as u8,
            });
        }
        
        // Collect prices from all sources
        let mut prices: Vec<(Decimal, u16)> = vec![];
        for source in &sources {
            if let Ok(price_data) = self.fetch_price(source, asset_id) {
                // Check freshness
                if self.is_price_fresh(&price_data) {
                    prices.push((price_data.price, source.weight));
                }
            }
        }
        
        if prices.len() < self.config.min_sources as usize {
            return Err(ContractError::InsufficientFreshPrices {});
        }
        
        // Calculate weighted median
        let median_price = self.weighted_median(&prices);
        
        // Filter outliers (>2% from median)
        let filtered: Vec<_> = prices.iter()
            .filter(|(p, _)| {
                let deviation = (*p - median_price).abs() / median_price;
                deviation <= Decimal::from_ratio(self.config.max_deviation_bps, 10000u128)
            })
            .collect();
        
        // Calculate final weighted average of filtered prices
        let total_weight: u128 = filtered.iter().map(|(_, w)| *w as u128).sum();
        let weighted_sum: Decimal = filtered.iter()
            .map(|(p, w)| *p * Decimal::from_ratio(*w as u128, total_weight))
            .sum();
        
        Ok(weighted_sum)
    }
    
    /// Get mark price (includes premium/discount)
    pub fn get_mark_price(&self, market_id: u32) -> Result<Decimal, ContractError> {
        let index_price = self.get_index_price(market_id)?;
        
        // Get internal TWAP from perp orderbook
        let internal_twap = self.get_internal_twap(market_id)?;
        
        // Mark price = Index + Premium
        // Premium is capped to prevent manipulation
        let premium = (internal_twap - index_price) / index_price;
        let capped_premium = premium.clamp(
            Decimal::from_ratio(-500u128, 10000u128),  // -5%
            Decimal::from_ratio(500u128, 10000u128),   // +5%
        );
        
        Ok(index_price * (Decimal::one() + capped_premium))
    }
}
```

### 8.3 Price Band Protection

```rust
/// Price band configuration (anti-manipulation)
pub struct PriceBandConfig {
    /// Maximum price change per block
    pub max_change_per_block_bps: u16,      // e.g., 50 bps (0.5%)
    /// Maximum price change per minute
    pub max_change_per_minute_bps: u16,     // e.g., 200 bps (2%)
    /// Circuit breaker threshold
    pub circuit_breaker_bps: u16,           // e.g., 1000 bps (10%)
    /// Circuit breaker cooldown
    pub circuit_breaker_cooldown_secs: u64, // e.g., 300 seconds (5 min)
}

impl PriceBandValidator {
    /// Validate price against bands
    pub fn validate_price(
        &self,
        new_price: Decimal,
        market: &Market,
    ) -> Result<(), ContractError> {
        let last_price = market.last_price;
        let change_ratio = (new_price - last_price).abs() / last_price;
        
        // Check per-block limit
        let max_block_change = Decimal::from_ratio(
            self.config.max_change_per_block_bps,
            10000u128,
        );
        if change_ratio > max_block_change {
            return Err(ContractError::PriceChangeExceedsBlockLimit {
                change: change_ratio,
                limit: max_block_change,
            });
        }
        
        // Check per-minute limit
        let price_1m_ago = self.get_price_at(market.id, env.block.time.minus_seconds(60))?;
        let minute_change = (new_price - price_1m_ago).abs() / price_1m_ago;
        let max_minute_change = Decimal::from_ratio(
            self.config.max_change_per_minute_bps,
            10000u128,
        );
        if minute_change > max_minute_change {
            return Err(ContractError::PriceChangeExceedsMinuteLimit {});
        }
        
        // Check circuit breaker
        let circuit_breaker_threshold = Decimal::from_ratio(
            self.config.circuit_breaker_bps,
            10000u128,
        );
        if change_ratio > circuit_breaker_threshold {
            self.trigger_circuit_breaker(market.id)?;
            return Err(ContractError::CircuitBreakerTriggered {});
        }
        
        Ok(())
    }
}
```

---

## 9. Smart Contract Design

### 9.1 Contract Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PERP DEX CONTRACT ARCHITECTURE                       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        PERP CONTROLLER                                │   │
│  │  - Order submission & matching                                        │   │
│  │  - Position management                                                │   │
│  │  - Liquidation execution                                              │   │
│  │  - ADL coordination                                                   │   │
│  │  - Funding rate application                                           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│         │              │                │               │                    │
│  ┌──────┴──────┐ ┌─────┴─────┐ ┌────────┴────────┐ ┌────┴────────┐         │
│  │   MARKET    │ │  MARGIN   │ │   INSURANCE     │ │   ORACLE    │         │
│  │  REGISTRY   │ │   VAULT   │ │     FUND        │ │    HUB      │         │
│  │             │ │           │ │                 │ │             │         │
│  │ - Market    │ │ - UST1    │ │ - Shortfall     │ │ - Price     │         │
│  │   configs   │ │   custody │ │   coverage      │ │   aggreg.   │         │
│  │ - Trading   │ │ - Cross/  │ │ - Staking       │ │ - Validity  │         │
│  │   params    │ │   isolated│ │ - Withdrawals   │ │   checks    │         │
│  │ - OI limits │ │   margin  │ │                 │ │             │         │
│  └─────────────┘ └───────────┘ └─────────────────┘ └─────────────┘         │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          TIER REGISTRY                                │   │
│  │  (Shared with Spot DEX for unified tier discounts)                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Perp Controller Contract

```rust
/// Perp Controller state
pub struct PerpControllerState {
    pub owner: Addr,
    pub market_registry: Addr,
    pub margin_vault: Addr,
    pub insurance_fund: Addr,
    pub oracle_hub: Addr,
    pub tier_registry: Addr,
    pub ust1_token: Addr,               // UST1 CW20 contract (NOT USTC)
    pub is_paused: bool,
    pub total_positions: u64,
    pub total_volume: Uint128,
}

/// Order structure
pub struct Order {
    pub id: u64,
    pub owner: Addr,
    pub market_id: u32,
    pub side: Side,
    pub order_type: OrderType,
    pub size: Uint128,                  // Position size in base asset
    pub price: Option<Decimal>,         // Limit price (None for market)
    pub leverage: Decimal,
    pub reduce_only: bool,
    pub post_only: bool,
    pub time_in_force: TimeInForce,
    pub client_order_id: Option<String>,
    pub created_at: Timestamp,
    pub expires_at: Option<Timestamp>,
}

pub enum OrderType {
    Market,
    Limit,
    StopMarket { trigger_price: Decimal },
    StopLimit { trigger_price: Decimal, limit_price: Decimal },
    TakeProfit { trigger_price: Decimal },
    TrailingStop { callback_rate: Decimal },
}

pub enum TimeInForce {
    GoodTilCancel,
    ImmediateOrCancel,
    FillOrKill,
    GoodTilTime { expiry: Timestamp },
}

/// Main execute messages
pub enum ExecuteMsg {
    /// Receive CW20 UST1 tokens (deposit margin)
    Receive(Cw20ReceiveMsg),
    
    /// Place a new order
    PlaceOrder {
        market_id: u32,
        side: Side,
        order_type: OrderType,
        size: Uint128,
        price: Option<Decimal>,
        leverage: Decimal,
        reduce_only: bool,
        post_only: bool,
        time_in_force: Option<TimeInForce>,
        client_order_id: Option<String>,
    },
    
    /// Cancel an existing order
    CancelOrder { order_id: u64 },
    
    /// Cancel all orders for a market
    CancelAllOrders { market_id: Option<u32> },
    
    /// Close a position (market order)
    ClosePosition {
        position_id: u64,
        size: Option<Uint128>,  // None = close entire position
    },
    
    /// Add margin to position
    AddMargin {
        position_id: u64,
        amount: Uint128,
    },
    
    /// Remove excess margin
    RemoveMargin {
        position_id: u64,
        amount: Uint128,
    },
    
    /// Update position leverage
    UpdateLeverage {
        position_id: u64,
        new_leverage: Decimal,
    },
    
    /// Liquidate an underwater position (keeper)
    Liquidate { position_id: u64 },
    
    /// Trigger ADL (internal, called by liquidation engine)
    ExecuteAdl {
        bankrupt_position_id: u64,
        shortfall: Uint128,
    },
    
    /// Apply funding payments (keeper)
    ApplyFunding { market_id: u32 },
    
    /// Withdraw margin to wallet
    Withdraw { amount: Uint128 },
    
    // Admin functions
    UpdateConfig { /* ... */ },
    AddMarket { /* ... */ },
    UpdateMarket { /* ... */ },
    Pause {},
    Unpause {},
}

/// CW20 Receive hook
pub enum Cw20HookMsg {
    /// Deposit UST1 as margin
    DepositMargin {
        margin_mode: Option<MarginMode>,
    },
    /// Deposit and open position in one tx
    DepositAndOpen {
        market_id: u32,
        side: Side,
        size: Uint128,
        leverage: Decimal,
        order_type: OrderType,
    },
}

/// Query messages
pub enum QueryMsg {
    /// Get account info
    Account { address: String },
    
    /// Get position details
    Position { position_id: u64 },
    
    /// Get all positions for account
    Positions { 
        address: String,
        market_id: Option<u32>,
    },
    
    /// Get open orders
    OpenOrders {
        address: String,
        market_id: Option<u32>,
    },
    
    /// Get market info
    Market { market_id: u32 },
    
    /// Get all markets
    Markets {},
    
    /// Get funding rate
    FundingRate { market_id: u32 },
    
    /// Get funding history
    FundingHistory {
        market_id: u32,
        start_time: Option<u64>,
        end_time: Option<u64>,
        limit: Option<u32>,
    },
    
    /// Get ADL ranking
    AdlRanking {
        market_id: u32,
        side: Side,
        limit: Option<u32>,
    },
    
    /// Get liquidation price for position
    LiquidationPrice { position_id: u64 },
    
    /// Estimate order execution
    SimulateOrder {
        market_id: u32,
        side: Side,
        size: Uint128,
        leverage: Decimal,
    },
}
```

### 9.3 Market Registry Contract

```rust
/// Market configuration
pub struct Market {
    pub id: u32,
    pub symbol: String,                     // e.g., "wBTC-PERP"
    pub base_asset: Addr,                   // CW20 contract of base asset
    pub quote_asset: Addr,                  // UST1 CW20 contract
    pub status: MarketStatus,
    
    // Leverage tiers
    pub leverage_tiers: Vec<LeverageTier>,
    
    // Fee configuration
    pub maker_fee_bps: i16,                 // Can be negative (rebate)
    pub taker_fee_bps: u16,
    
    // Position limits
    pub max_open_interest: Uint128,
    pub max_position_size: Uint128,
    pub min_position_size: Uint128,
    
    // Funding
    pub funding_interval_secs: u64,
    pub max_funding_rate_bps: u16,
    
    // Oracle
    pub oracle_asset_id: u32,
    
    // Current state
    pub long_open_interest: Uint128,
    pub short_open_interest: Uint128,
    pub last_price: Decimal,
    pub last_funding_time: Timestamp,
    pub cumulative_funding: SignedDecimal,
}

pub enum MarketStatus {
    Active,
    ReduceOnly,     // Only closing trades allowed
    Paused,         // No trading
    Settling,       // Market closing, final settlement
}
```

---

## 10. Risk Management

### 10.1 Open Interest Limits

```rust
/// Open interest configuration
pub struct OiLimits {
    /// Maximum total OI across all markets (in UST1)
    pub max_total_oi: Uint128,
    /// Maximum OI per market
    pub max_market_oi: Uint128,
    /// Maximum OI per account per market
    pub max_account_oi_per_market: Uint128,
    /// Maximum concentration (% of total OI one account can hold)
    pub max_concentration_bps: u16,
}

impl RiskManager {
    /// Validate new position against OI limits
    pub fn validate_position(
        &self,
        account: &Addr,
        market: &Market,
        new_size: Uint128,
        side: Side,
    ) -> Result<(), ContractError> {
        let mark_price = self.oracle.get_mark_price(market.id)?;
        let new_oi = new_size * mark_price;
        
        // Check market OI limit
        let current_market_oi = market.long_open_interest + market.short_open_interest;
        if current_market_oi + new_oi > self.limits.max_market_oi {
            return Err(ContractError::MarketOiLimitExceeded {});
        }
        
        // Check account concentration
        let account_oi = self.get_account_oi(account, market.id)?;
        let new_concentration = Decimal::from_ratio(
            account_oi + new_oi,
            current_market_oi + new_oi,
        );
        let max_concentration = Decimal::from_ratio(
            self.limits.max_concentration_bps,
            10000u128,
        );
        if new_concentration > max_concentration {
            return Err(ContractError::ConcentrationLimitExceeded {});
        }
        
        // Check account position limit
        if account_oi + new_oi > self.limits.max_account_oi_per_market {
            return Err(ContractError::AccountOiLimitExceeded {});
        }
        
        Ok(())
    }
}
```

### 10.2 Circuit Breakers

```rust
/// Circuit breaker configuration
pub struct CircuitBreakerConfig {
    /// Trigger when price moves X% in Y minutes
    pub price_trigger_bps: u16,
    pub price_window_secs: u64,
    
    /// Trigger when volume exceeds X in Y minutes
    pub volume_trigger: Uint128,
    pub volume_window_secs: u64,
    
    /// Trigger when liquidations exceed X in Y minutes
    pub liquidation_trigger_count: u32,
    pub liquidation_window_secs: u64,
    
    /// Cooldown after trigger
    pub cooldown_secs: u64,
}

pub enum CircuitBreakerAction {
    /// Reduce max leverage
    ReduceLeverage { new_max: Decimal },
    /// Increase margin requirements
    IncreaseMargin { multiplier: Decimal },
    /// Switch to reduce-only mode
    ReduceOnlyMode,
    /// Full market pause
    PauseMarket,
}
```

### 10.3 Risk Dashboard Metrics

```rust
/// Risk metrics for monitoring
pub struct RiskMetrics {
    pub total_long_oi: Uint128,
    pub total_short_oi: Uint128,
    pub oi_imbalance_ratio: Decimal,        // |long - short| / (long + short)
    pub total_margin_held: Uint128,
    pub insurance_fund_balance: Uint128,
    pub insurance_fund_ratio: Decimal,       // IF / total OI
    pub positions_at_risk: u32,              // Positions within 20% of liquidation
    pub recent_liquidations_1h: u32,
    pub recent_adl_events_24h: u32,
    pub current_funding_rate: SignedDecimal,
    pub mark_index_deviation: Decimal,
}
```

---

## 11. Fee Structure

### 11.1 Trading Fees

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PERP DEX FEE STRUCTURE                            │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ TRADING FEES (Applied to Notional Value)                               │ │
│  │                                                                        │ │
│  │   Tier        Maker Fee       Taker Fee       Tier Requirement        │ │
│  │   ─────────   ──────────      ──────────      ─────────────────       │ │
│  │   Default     0.02%           0.06%           0 UST1 burned           │ │
│  │   Bronze      0.01%           0.05%           5,000 UST1 burned       │ │
│  │   Silver      0.00%           0.04%           50,000 UST1 burned      │ │
│  │   Gold        -0.01% (rebate) 0.03%           150,000 UST1 burned     │ │
│  │   Diamond     -0.02% (rebate) 0.02%           500,000 UST1 burned     │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ FEE DISTRIBUTION                                                       │ │
│  │                                                                        │ │
│  │   50% → UST1 Buy & Burn                                               │ │
│  │   30% → Insurance Fund                                                │ │
│  │   20% → Protocol Treasury (DAO)                                       │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ OTHER FEES                                                             │ │
│  │                                                                        │ │
│  │   Liquidation Fee:      1.0% of position (0.5% to keeper, 0.5% to IF) │ │
│  │   Funding Rate:         Variable (paid between longs/shorts)          │ │
│  │   Withdrawal Fee:       0.1% (flat, to UST1 burn)                     │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Fee Calculation

```rust
/// Fee configuration per tier
pub struct FeeConfig {
    pub tier_id: u8,
    pub maker_fee_bps: i16,     // Negative = rebate
    pub taker_fee_bps: u16,
}

pub fn default_fee_tiers() -> Vec<FeeConfig> {
    vec![
        FeeConfig { tier_id: 0, maker_fee_bps: 2, taker_fee_bps: 6 },      // Default
        FeeConfig { tier_id: 1, maker_fee_bps: 1, taker_fee_bps: 5 },      // Bronze
        FeeConfig { tier_id: 2, maker_fee_bps: 0, taker_fee_bps: 4 },      // Silver
        FeeConfig { tier_id: 3, maker_fee_bps: -1, taker_fee_bps: 3 },     // Gold
        FeeConfig { tier_id: 4, maker_fee_bps: -2, taker_fee_bps: 2 },     // Diamond
    ]
}

/// Calculate trading fee for an order
pub fn calculate_trading_fee(
    notional_value: Uint128,
    is_maker: bool,
    tier: &UserTierInfo,
) -> SignedInt128 {
    let fee_config = get_fee_config(tier.current_tier);
    
    let fee_bps = if is_maker {
        fee_config.maker_fee_bps
    } else {
        fee_config.taker_fee_bps as i16
    };
    
    // Calculate fee (can be negative for maker rebates)
    if fee_bps >= 0 {
        SignedInt128::positive(
            notional_value.multiply_ratio(fee_bps as u128, 10000u128)
        )
    } else {
        SignedInt128::negative(
            notional_value.multiply_ratio((-fee_bps) as u128, 10000u128)
        )
    }
}
```

---

## 12. Backend Architecture

### 12.1 Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND SERVICES                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      API GATEWAY (Node.js)                           │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐ │   │
│  │  │   REST     │  │  WebSocket │  │  GraphQL   │  │  Admin API     │ │   │
│  │  │   /api/v1  │  │  /ws       │  │  /graphql  │  │  /admin        │ │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│  ┌───────────────────────────────────┼───────────────────────────────────┐ │
│  │                                   │                                    │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │ │
│  │  │   MATCHER    │  │  LIQUIDATION │  │   FUNDING    │  │   ORACLE   │ │ │
│  │  │   SERVICE    │  │   KEEPER     │  │   KEEPER     │  │  FEEDER    │ │ │
│  │  │   (Rust)     │  │   (Rust)     │  │   (Node.js)  │  │  (Rust)    │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │ │
│  │         │                 │                │                │         │ │
│  │         └─────────────────┴────────────────┴────────────────┘         │ │
│  │                                   │                                    │ │
│  │                    ┌──────────────┴──────────────┐                    │ │
│  │                    │        MESSAGE QUEUE         │                    │ │
│  │                    │         (Redis PubSub)       │                    │ │
│  │                    └──────────────────────────────┘                    │ │
│  │                                   │                                    │ │
│  │         ┌─────────────────────────┴─────────────────────────┐         │ │
│  │         │                                                    │         │ │
│  │  ┌──────┴──────┐  ┌─────────────────┐  ┌────────────────────┴──────┐ │ │
│  │  │  INDEXER    │  │   ANALYTICS     │  │      RISK MONITOR         │ │ │
│  │  │  (Rust)     │  │   (Node.js)     │  │      (Rust)               │ │ │
│  │  └─────────────┘  └─────────────────┘  └───────────────────────────┘ │ │
│  │         │                 │                       │                   │ │
│  └─────────┴─────────────────┴───────────────────────┴───────────────────┘ │
│                              │                                              │
│           ┌──────────────────┴──────────────────┐                          │
│           │                                      │                          │
│    ┌──────┴──────┐                       ┌───────┴───────┐                 │
│    │  PostgreSQL │                       │     Redis     │                 │
│    │  + Timescale│                       │   (Cache +    │                 │
│    │             │                       │    PubSub)    │                 │
│    └─────────────┘                       └───────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Database Schema

```sql
-- Perpetual DEX Database Schema

-- =============================================================================
-- MARKETS
-- =============================================================================

CREATE TABLE markets (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    base_asset_address VARCHAR(64) NOT NULL,
    quote_asset_address VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    maker_fee_bps SMALLINT NOT NULL,
    taker_fee_bps SMALLINT NOT NULL,
    max_leverage DECIMAL(10, 2) NOT NULL,
    max_open_interest NUMERIC(38, 0) NOT NULL,
    funding_interval_secs INTEGER NOT NULL DEFAULT 3600,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- POSITIONS
-- =============================================================================

CREATE TABLE positions (
    id BIGSERIAL PRIMARY KEY,
    owner VARCHAR(64) NOT NULL,
    market_id INTEGER REFERENCES markets(id),
    side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
    size NUMERIC(38, 0) NOT NULL,
    entry_price NUMERIC(38, 18) NOT NULL,
    margin NUMERIC(38, 0) NOT NULL,
    leverage DECIMAL(10, 2) NOT NULL,
    unrealized_pnl NUMERIC(38, 0) NOT NULL DEFAULT 0,
    realized_pnl NUMERIC(38, 0) NOT NULL DEFAULT 0,
    accumulated_funding NUMERIC(38, 0) NOT NULL DEFAULT 0,
    liquidation_price NUMERIC(38, 18),
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_owner ON positions(owner, status);
CREATE INDEX idx_positions_market ON positions(market_id, status);
CREATE INDEX idx_positions_liquidation ON positions(market_id, liquidation_price) 
    WHERE status = 'open';

-- =============================================================================
-- ORDERS
-- =============================================================================

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    owner VARCHAR(64) NOT NULL,
    market_id INTEGER REFERENCES markets(id),
    side VARCHAR(10) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    size NUMERIC(38, 0) NOT NULL,
    price NUMERIC(38, 18),
    trigger_price NUMERIC(38, 18),
    filled_size NUMERIC(38, 0) NOT NULL DEFAULT 0,
    leverage DECIMAL(10, 2) NOT NULL,
    reduce_only BOOLEAN DEFAULT FALSE,
    post_only BOOLEAN DEFAULT FALSE,
    time_in_force VARCHAR(20) NOT NULL DEFAULT 'gtc',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    client_order_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    filled_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

CREATE INDEX idx_orders_owner ON orders(owner, status);
CREATE INDEX idx_orders_market ON orders(market_id, status, price);

-- =============================================================================
-- TRADES
-- =============================================================================

CREATE TABLE trades (
    id BIGSERIAL,
    tx_hash VARCHAR(64) NOT NULL,
    market_id INTEGER REFERENCES markets(id),
    taker_order_id BIGINT REFERENCES orders(id),
    maker_order_id BIGINT REFERENCES orders(id),
    taker_address VARCHAR(64) NOT NULL,
    maker_address VARCHAR(64) NOT NULL,
    side VARCHAR(10) NOT NULL,
    size NUMERIC(38, 0) NOT NULL,
    price NUMERIC(38, 18) NOT NULL,
    taker_fee NUMERIC(38, 0) NOT NULL,
    maker_fee NUMERIC(38, 0) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    block_height BIGINT NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('trades', 'timestamp');
CREATE INDEX idx_trades_market ON trades(market_id, timestamp DESC);

-- =============================================================================
-- FUNDING HISTORY
-- =============================================================================

CREATE TABLE funding_history (
    id BIGSERIAL,
    market_id INTEGER REFERENCES markets(id),
    funding_rate NUMERIC(38, 18) NOT NULL,
    mark_price NUMERIC(38, 18) NOT NULL,
    index_price NUMERIC(38, 18) NOT NULL,
    long_oi NUMERIC(38, 0) NOT NULL,
    short_oi NUMERIC(38, 0) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('funding_history', 'timestamp');

-- =============================================================================
-- LIQUIDATIONS
-- =============================================================================

CREATE TABLE liquidations (
    id BIGSERIAL,
    position_id BIGINT NOT NULL,
    owner VARCHAR(64) NOT NULL,
    market_id INTEGER REFERENCES markets(id),
    side VARCHAR(10) NOT NULL,
    size NUMERIC(38, 0) NOT NULL,
    execution_price NUMERIC(38, 18) NOT NULL,
    margin_lost NUMERIC(38, 0) NOT NULL,
    liquidator VARCHAR(64),
    liquidator_fee NUMERIC(38, 0) NOT NULL,
    insurance_contribution NUMERIC(38, 0) NOT NULL,
    shortfall NUMERIC(38, 0) DEFAULT 0,
    triggered_adl BOOLEAN DEFAULT FALSE,
    tx_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    block_height BIGINT NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('liquidations', 'timestamp');

-- =============================================================================
-- ADL EVENTS
-- =============================================================================

CREATE TABLE adl_events (
    id BIGSERIAL,
    bankrupt_position_id BIGINT NOT NULL,
    deleveraged_position_id BIGINT NOT NULL,
    deleveraged_owner VARCHAR(64) NOT NULL,
    market_id INTEGER REFERENCES markets(id),
    size NUMERIC(38, 0) NOT NULL,
    execution_price NUMERIC(38, 18) NOT NULL,
    profit_absorbed NUMERIC(38, 0) NOT NULL,
    tx_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    block_height BIGINT NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('adl_events', 'timestamp');

-- =============================================================================
-- INSURANCE FUND
-- =============================================================================

CREATE TABLE insurance_fund_events (
    id BIGSERIAL,
    event_type VARCHAR(30) NOT NULL,
    amount NUMERIC(38, 0) NOT NULL,
    source VARCHAR(50),
    balance_after NUMERIC(38, 0) NOT NULL,
    tx_hash VARCHAR(64),
    timestamp TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('insurance_fund_events', 'timestamp');
```

---

## 13. Frontend Design

### 13.1 Trading Terminal Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Header: Logo | Markets Dropdown | Wallet | Network | Settings              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────┐  ┌────────────────────────────────────┐│
│  │         PRICE CHART             │  │         ORDER FORM                 ││
│  │                                 │  │  ┌────────────────────────────────┐││
│  │   TradingView Chart             │  │  │ [LONG]        [SHORT]          │││
│  │   - Candlesticks                │  │  └────────────────────────────────┘││
│  │   - Volume                      │  │                                    ││
│  │   - Funding rate overlay        │  │  Order Type: [Market ▼]            ││
│  │   - Liquidation levels          │  │                                    ││
│  │                                 │  │  Size:     [____] wBTC             ││
│  │                                 │  │  Leverage: [====== 10x ======]     ││
│  │                                 │  │                                    ││
│  │                                 │  │  Margin:   500.00 UST1             ││
│  │                                 │  │  Fee:      0.30 UST1 (0.06%)       ││
│  │                                 │  │  Liq Price: 41,250.00              ││
│  │                                 │  │                                    ││
│  │                                 │  │  [     OPEN LONG POSITION     ]    ││
│  └─────────────────────────────────┘  └────────────────────────────────────┘│
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┤
│  │  Market Info Bar                                                         │
│  │  Mark: $45,230.50 | Index: $45,215.00 | 24h Change: +2.5% | Volume: $12M │
│  │  Funding: 0.0100% (1h) | OI: $85M Long / $72M Short | Next Funding: 45m  │
│  └──────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────┐  ┌─────────────────────────────────────┐│
│  │       ORDERBOOK                │  │         RECENT TRADES              ││
│  │  Price        Size     Total   │  │  Price      Size     Time          ││
│  │  45,235.00    0.50     0.50    │  │  45,230.50  0.15     12:45:32      ││
│  │  45,234.00    1.20     1.70    │  │  45,229.00  0.08     12:45:30      ││
│  │  45,233.00    0.80     2.50    │  │  45,231.00  0.22     12:45:28      ││
│  │  ─────────── SPREAD ───────────│  │  ...                               ││
│  │  45,230.00    0.95     0.95    │  │                                    ││
│  │  45,229.00    2.10     3.05    │  │                                    ││
│  │  45,228.00    1.50     4.55    │  │                                    ││
│  └────────────────────────────────┘  └─────────────────────────────────────┘│
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Tabs: [Positions] [Open Orders] [Trade History] [Funding History]          │
├──────────────────────────────────────────────────────────────────────────────┤
│  POSITIONS                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ Market   Side   Size    Entry    Mark     PnL        Margin   Liq    ADL││
│  │ wBTC     LONG   0.5     44,500   45,230   +$365.00   $2,225   $41,250 ●●●││
│  │ wETH     SHORT  2.0     2,850    2,810    +$80.00    $285     $3,100  ●● ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Key UI Components

```tsx
// components/trading/OrderForm.tsx
export function OrderForm({ market }: { market: Market }) {
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [size, setSize] = useState('');
  const [leverage, setLeverage] = useState(10);
  const [price, setPrice] = useState('');
  
  const { tier } = useUserTier();
  const { balance } = useMargin();
  
  // Calculate position details
  const markPrice = useMarkPrice(market.id);
  const requiredMargin = useMemo(() => {
    if (!size || !markPrice) return null;
    const notional = parseFloat(size) * markPrice;
    return notional / leverage;
  }, [size, markPrice, leverage]);
  
  const fee = useMemo(() => {
    if (!size || !markPrice) return null;
    const notional = parseFloat(size) * markPrice;
    const feeBps = orderType === 'limit' ? tier.makerFeeBps : tier.takerFeeBps;
    return notional * (feeBps / 10000);
  }, [size, markPrice, orderType, tier]);
  
  const liquidationPrice = useMemo(() => {
    if (!size || !markPrice || !requiredMargin) return null;
    return calculateLiquidationPrice(
      markPrice,
      side,
      parseFloat(size),
      requiredMargin,
      market.maintenanceMarginRatio,
    );
  }, [size, markPrice, side, requiredMargin, market]);
  
  return (
    <div className="order-form">
      {/* Side Toggle */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={side === 'long' ? 'success' : 'ghost'}
          onClick={() => setSide('long')}
          className="flex-1"
        >
          Long
        </Button>
        <Button
          variant={side === 'short' ? 'danger' : 'ghost'}
          onClick={() => setSide('short')}
          className="flex-1"
        >
          Short
        </Button>
      </div>
      
      {/* Order Type */}
      <Select value={orderType} onChange={setOrderType}>
        <Option value="market">Market</Option>
        <Option value="limit">Limit</Option>
        <Option value="stop_market">Stop Market</Option>
        <Option value="stop_limit">Stop Limit</Option>
      </Select>
      
      {/* Size Input */}
      <div className="mt-4">
        <label>Size ({market.baseAssetSymbol})</label>
        <Input
          type="number"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          placeholder="0.00"
        />
      </div>
      
      {/* Leverage Slider */}
      <div className="mt-4">
        <div className="flex justify-between">
          <label>Leverage</label>
          <span className="font-bold">{leverage}x</span>
        </div>
        <Slider
          min={1}
          max={market.maxLeverage}
          value={leverage}
          onChange={setLeverage}
        />
      </div>
      
      {/* Position Details */}
      <div className="mt-4 p-3 bg-gray-800 rounded-lg text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Required Margin</span>
          <span>{requiredMargin?.toFixed(2) || '-'} UST1</span>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-gray-400">Trading Fee ({tier.name})</span>
          <span>{fee?.toFixed(2) || '-'} UST1</span>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-gray-400">Liquidation Price</span>
          <span className="text-orange-400">
            ${liquidationPrice?.toFixed(2) || '-'}
          </span>
        </div>
      </div>
      
      {/* Submit Button */}
      <Button
        className="w-full mt-4"
        variant={side === 'long' ? 'success' : 'danger'}
        disabled={!size || !requiredMargin || requiredMargin > balance}
      >
        {side === 'long' ? 'Open Long' : 'Open Short'}
      </Button>
    </div>
  );
}
```

### 13.3 ADL Indicator Component

```tsx
// components/trading/AdlIndicator.tsx
export function AdlIndicator({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  const lights = [1, 2, 3, 4, 5];
  
  return (
    <Tooltip content={getAdlTooltip(level)}>
      <div className="flex gap-0.5">
        {lights.map((l) => (
          <div
            key={l}
            className={`w-2 h-4 rounded-sm ${
              l <= level
                ? level >= 4
                  ? 'bg-red-500'
                  : level >= 3
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
                : 'bg-gray-600'
            }`}
          />
        ))}
      </div>
    </Tooltip>
  );
}

function getAdlTooltip(level: number): string {
  switch (level) {
    case 5:
      return 'Highest ADL risk - Your position may be deleveraged first if ADL is triggered';
    case 4:
      return 'High ADL risk - Consider reducing leverage or taking profits';
    case 3:
      return 'Medium ADL risk';
    case 2:
      return 'Low ADL risk';
    case 1:
    default:
      return 'Lowest ADL risk';
  }
}
```

---

## 14. Security Considerations

### 14.1 Smart Contract Security

| Security Measure | Implementation |
|------------------|----------------|
| Reentrancy Protection | Check-Effects-Interactions pattern, reentrancy guards |
| Oracle Manipulation | Multi-source aggregation, TWAP, price bands |
| Flash Loan Attacks | Same-block restrictions, cooldown periods |
| Integer Overflow | Checked math, Uint256 for large values |
| Access Control | Role-based permissions, multi-sig admin |
| Pausability | Emergency pause mechanism |
| Upgradeability | Proxy pattern with timelock |

### 14.2 Audit Requirements

- [ ] Full audit by reputable firm (Trail of Bits, OpenZeppelin, Halborn)
- [ ] Formal verification of core math (liquidation, ADL, funding)
- [ ] Economic audit of tokenomics and incentive structures
- [ ] Bug bounty program ($100k-$500k based on severity)

### 14.3 Operational Security

- **Multi-sig Admin**: 4-of-7 multi-sig for critical operations
- **Timelock**: 48-hour delay on parameter changes
- **Monitoring**: 24/7 alerting on suspicious activity
- **Circuit Breakers**: Automatic market pause on anomalies
- **Gradual Rollout**: Low limits initially, increase with confidence

---

## 15. Implementation Phases

### Phase 1: Core Infrastructure (10-12 weeks)

- [ ] Perp Controller contract (orders, positions)
- [ ] Margin Vault (UST1 custody)
- [ ] Market Registry
- [ ] Basic Oracle Hub (single source)
- [ ] Unit tests for all core logic

### Phase 2: Risk Management (8-10 weeks)

- [ ] Liquidation engine
- [ ] Insurance Fund contract
- [ ] ADL system
- [ ] Multi-source oracle aggregation
- [ ] Funding rate mechanism

### Phase 3: Anti-Toxic Flow (6-8 weeks)

- [ ] Batch auction system
- [ ] Commit-reveal orders (optional)
- [ ] Dynamic spreads
- [ ] Rate limiting
- [ ] Price band protection

### Phase 4: Backend & Indexing (6-8 weeks)

- [ ] PostgreSQL schema
- [ ] Indexer service
- [ ] REST/WebSocket API
- [ ] Liquidation keeper
- [ ] Funding keeper

### Phase 5: Frontend (8-10 weeks)

- [ ] Trading terminal UI
- [ ] Position management
- [ ] Order history
- [ ] Funding dashboard
- [ ] Mobile-responsive design

### Phase 6: Testing & Audit (6-8 weeks)

- [ ] Testnet deployment
- [ ] Community testing
- [ ] Security audit
- [ ] Bug bounty launch
- [ ] Performance optimization

### Phase 7: Mainnet Launch

- [ ] Gradual parameter increases
- [ ] Market maker onboarding
- [ ] Liquidity incentives
- [ ] Documentation & support

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **ADL** | Auto-Deleveraging - forced closure of profitable positions to cover bankrupt positions |
| **Funding Rate** | Periodic payment between longs and shorts to anchor perp price to spot |
| **Index Price** | Reference price from external spot markets |
| **Insurance Fund** | Protocol-owned fund to cover liquidation shortfalls |
| **Leverage** | Position size divided by margin |
| **Liquidation** | Forced closure of position when margin falls below maintenance |
| **Maintenance Margin** | Minimum margin required to keep position open |
| **Mark Price** | Fair value price used for P&L and liquidation calculations |
| **Open Interest** | Total value of all open positions |
| **Perpetual** | Derivative contract with no expiration date |
| **Toxic Flow** | Trading activity that systematically extracts value from LPs |
| **TWAP** | Time-Weighted Average Price |
| **UST1** | CW20 stablecoin used as collateral (NOT native USTC) |

---

## Appendix B: Token Support

| Type | Supported | Notes |
|------|-----------|-------|
| CW20 Tokens | Yes | Full support for all CW20-compliant tokens |
| Native LUNC | **No** | Must be wrapped to CW20 (wLUNC) |
| Native USTC | **No** | Not supported - use UST1 (CW20) instead |
| IBC Tokens | **No** | Must be wrapped to CW20 |

> **Important**: This Perp DEX uses UST1 (a CW20 token) for all margin and settlement. Native USTC is NOT supported.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-29 | - | Initial proposal |

---

*This document is a living proposal and subject to community feedback and governance decisions.*
