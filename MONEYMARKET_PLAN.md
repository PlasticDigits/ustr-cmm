# UST1 Money Market — Oracle-Free Lending Protocol

> **Version**: 1.0  
> **Date**: January 2025  
> **Status**: Proposal  
> **Network**: TerraClassic Mainnet (columbus-5)  
> **Dependencies**: USTR CMM Phase 2 (UST1 Token)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Background & Motivation](#background--motivation)
3. [Oracle-Free Design Philosophy](#oracle-free-design-philosophy)
4. [Pain Points & Solutions](#pain-points--solutions)
5. [System Architecture](#system-architecture)
6. [Core Mechanisms](#core-mechanisms)
7. [Pool Types & Configuration](#pool-types--configuration)
8. [Liquidation Engine](#liquidation-engine)
9. [Interest Rate Model](#interest-rate-model)
10. [Governance & Parameters](#governance--parameters)
11. [Risk Framework](#risk-framework)
12. [User Experience Design](#user-experience-design)
13. [Integration with USTR CMM](#integration-with-ustr-cmm)
14. [Development Phases](#development-phases)
15. [Security Considerations](#security-considerations)
16. [Future Extensions](#future-extensions)

---

## Executive Summary

This proposal outlines an **oracle-free money market protocol** for TerraClassic, designed around **UST1** as the primary quote asset. Inspired by Ajna's permissionless lending model but enhanced with specific innovations to address known pain points, this protocol enables:

- **Trustless lending and borrowing** without external price oracles
- **Permissionless pool creation** for any token pair
- **Market-driven price discovery** through lender-specified price buckets
- **Predictable, transparent liquidations** via Dutch auctions
- **Deep integration with UST1** as the ecosystem's primary unit of account

### Key Innovations Over Existing Designs

| Pain Point | Traditional Oracle-Free | Our Solution |
|------------|------------------------|--------------|
| Capital inefficiency | Fragmented liquidity across buckets | Smart bucket aggregation + automated rebalancing vaults |
| Complex UX for lenders | Manual bucket selection | Simplified "risk tier" abstraction with auto-placement |
| Slow liquidations | Fixed-rate Dutch auctions | Adaptive-rate auctions with MEV protection |
| Limited composability | Isolated pools only | Composable vault layer for yield strategies |
| Poor price discovery | Bucket gaps create arbitrage | Continuous bucket pricing with dynamic spreads |

---

## Background & Motivation

### Why Oracle-Free?

Traditional DeFi lending protocols (Aave, Compound, Maker) rely on price oracles to:
- Determine collateral values
- Trigger liquidations
- Calculate borrowing power

This oracle dependency introduces critical risks:

| Risk | Description | Impact |
|------|-------------|--------|
| **Oracle manipulation** | Attackers manipulate price feeds to trigger false liquidations | Loss of user funds |
| **Flash loan attacks** | Instantaneous price manipulation within a single block | Protocol insolvency |
| **Oracle failure** | Stale prices, downtime, or incorrect data | Frozen liquidations, bad debt |
| **Centralization** | Reliance on centralized oracle providers | Governance attack vector |
| **Latency** | Price updates lag market movements | Arbitrage against protocol |

### The Oracle-Free Alternative

Oracle-free protocols eliminate these risks by deriving prices from **market participant behavior**:

- **Lenders specify prices** at which they're willing to lend
- **Borrowers self-collateralize** based on their risk assessment
- **Liquidations occur** when market-derived prices make positions undercollateralized
- **No external dependency** means no oracle attack surface

### Why Build on TerraClassic?

1. **UST1 Native Integration**: The USTR CMM protocol establishes UST1 as a collateralized unstablecoin, creating natural demand for UST1-denominated lending markets
2. **Existing Infrastructure**: CW20 tokens, IBC connectivity, and active validator set
3. **Community Alignment**: Money market functionality supports ecosystem growth
4. **Lower Fees**: TerraClassic's fee structure enables more granular market operations

---

## Oracle-Free Design Philosophy

### Price Discovery Through Participation

Instead of querying external price feeds, the protocol discovers prices through **lender behavior**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRICE DISCOVERY MODEL                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Traditional (Oracle):                                         │
│   ┌──────────┐     query     ┌──────────┐                      │
│   │ Protocol │ ───────────► │  Oracle  │ ───► External Data    │
│   └──────────┘               └──────────┘                      │
│                                                                 │
│   Oracle-Free:                                                  │
│   ┌──────────┐     deposit   ┌──────────────────────────────┐  │
│   │ Lenders  │ ───────────► │  Price Buckets               │  │
│   └──────────┘               │  1.00 UST1/LUNC: 50,000 UST1 │  │
│                              │  0.95 UST1/LUNC: 80,000 UST1 │  │
│                              │  0.90 UST1/LUNC: 120,000 UST1│  │
│                              │  ...                         │  │
│                              └──────────────────────────────┘  │
│                                        │                        │
│                              Market-implied price = highest     │
│                              bucket with available liquidity    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Core Principles

1. **No Governance-Set Parameters for Pricing**: Market participants determine all prices
2. **Deterministic Interest Rates**: Rates derived from pool utilization, not governance
3. **Permissionless Markets**: Anyone can create a lending pool for any token pair
4. **Isolated Risk**: Each pool's risk is contained; no cross-contamination
5. **Transparent Mechanics**: All calculations reproducible on-chain

---

## Pain Points & Solutions

### Pain Point 1: Capital Inefficiency

**Problem**: In bucket-based systems like Ajna, liquidity fragments across discrete price levels. A lender at $1.00 doesn't provide liquidity at $0.99, even though they might be willing to lend there.

**Our Solution: Smart Bucket Aggregation**

```
┌─────────────────────────────────────────────────────────────────┐
│               SMART BUCKET AGGREGATION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Traditional Buckets:           Smart Aggregation:             │
│   ┌──────┐ ┌──────┐ ┌──────┐    ┌────────────────────────────┐ │
│   │$1.00 │ │$0.99 │ │$0.98 │    │   Risk Band: 1.00 - 0.95   │ │
│   │ 10k  │ │  5k  │ │  8k  │    │   Total Liquidity: 50k     │ │
│   └──────┘ └──────┘ └──────┘    │   Auto-fills from top      │ │
│      ↓        ↓        ↓        └────────────────────────────┘ │
│   Separate   Separate   Separate        Single exposure         │
│   positions  positions  positions       with range              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation**:
- Lenders specify a **price range** rather than a single bucket
- Liquidity auto-allocates within the range based on borrower demand
- Lenders earn blended interest across utilized portions of their range
- Reduces bucket fragmentation by 60-80% in typical markets

### Pain Point 2: Complex Lender UX

**Problem**: Lenders must understand bucket mechanics, monitor positions, and manually rebalance. This creates high cognitive load and excludes less sophisticated users.

**Our Solution: Risk Tier Abstraction**

```
┌─────────────────────────────────────────────────────────────────┐
│                    RISK TIER SYSTEM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User Selects:          System Translates:                     │
│                                                                 │
│   ┌─────────────────┐    ┌─────────────────────────────────┐   │
│   │ 🟢 Conservative │    │ Price range: 95-100% of spot    │   │
│   │ Lower yield     │ ─► │ Higher in queue (safer)         │   │
│   │ Lower risk      │    │ Expected APY: 3-5%              │   │
│   └─────────────────┘    └─────────────────────────────────┘   │
│                                                                 │
│   ┌─────────────────┐    ┌─────────────────────────────────┐   │
│   │ 🟡 Moderate     │    │ Price range: 85-95% of spot     │   │
│   │ Balanced yield  │ ─► │ Middle queue position           │   │
│   │ Moderate risk   │    │ Expected APY: 6-10%             │   │
│   └─────────────────┘    └─────────────────────────────────┘   │
│                                                                 │
│   ┌─────────────────┐    ┌─────────────────────────────────┐   │
│   │ 🔴 Aggressive   │    │ Price range: 70-85% of spot     │   │
│   │ Higher yield    │ ─► │ Deeper in queue (riskier)       │   │
│   │ Higher risk     │    │ Expected APY: 12-20%            │   │
│   └─────────────────┘    └─────────────────────────────────┘   │
│                                                                 │
│   "Spot" = current highest active lending bucket                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation**:
- Three-tier system: Conservative, Moderate, Aggressive
- System automatically places liquidity in appropriate bucket ranges
- Users see simplified yield/risk metrics, not bucket mechanics
- Advanced users can still access raw bucket interface
- Auto-rebalancing optional add-on (see Vaults section)

### Pain Point 3: Slow or Failed Liquidations

**Problem**: Fixed-rate Dutch auctions can be too slow in fast-moving markets, leading to bad debt. Alternatively, they can be too fast, allowing MEV bots to extract value.

**Our Solution: Adaptive-Rate Dutch Auctions with MEV Protection**

```
┌─────────────────────────────────────────────────────────────────┐
│              ADAPTIVE LIQUIDATION AUCTIONS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Price                                                         │
│    ▲                                                            │
│    │  Starting Price (120% of debt)                            │
│    │  ●────────────────────────────                            │
│    │        ╲                                                   │
│    │          ╲  ← Slow decay initially (fair price discovery) │
│    │            ╲                                               │
│    │              ╲                                             │
│    │                ╲                                           │
│    │                  ╲  ← Accelerating decay (urgency)        │
│    │                    ╲                                       │
│    │                      ●  Market clearing price              │
│    │                        ╲                                   │
│    │                          ╲  ← Fast decay (prevent bad debt)│
│    │                            ●                               │
│    └────────────────────────────────────────────────────────► Time
│         2 hrs            6 hrs            12 hrs     24 hrs     │
│                                                                 │
│   MEV Protection:                                               │
│   • Minimum 2-block delay between kick and first take          │
│   • Pro-rata sharing if multiple takers in same block          │
│   • Partial fills allowed (min 10% of remaining)               │
│   • Kicker reward scales with time-to-clear                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation**:
- Exponential decay curve instead of linear
- Decay rate adapts based on collateral volatility history
- MEV protection via minimum delay and pro-rata fills
- Kickers incentivized to identify underwater positions early
- Partial liquidations reduce position-clearing risk

### Pain Point 4: Liquidity Fragmentation Across Pools

**Problem**: Each token pair requires its own isolated pool. A lender wanting to lend UST1 across multiple collateral types must manage separate positions.

**Our Solution: Composable Vault Layer**

```
┌─────────────────────────────────────────────────────────────────┐
│                  COMPOSABLE VAULT ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    USER VAULTS                          │   │
│   │   "Deposit UST1, earn yield across multiple pools"      │   │
│   │                                                         │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│   │   │ Conservative │  │   Balanced  │  │  Aggressive │   │   │
│   │   │   Vault     │  │    Vault    │  │    Vault    │   │   │
│   │   │   TVL: $2M  │  │   TVL: $5M  │  │   TVL: $1M  │   │   │
│   │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │   │
│   └──────────┼────────────────┼────────────────┼───────────┘   │
│              │                │                │                │
│              ▼                ▼                ▼                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  ALLOCATION ENGINE                      │   │
│   │   Curators define allocation strategies                 │   │
│   │   Auto-rebalances based on utilization & risk          │   │
│   └─────────────────────────────────────────────────────────┘   │
│              │                │                │                │
│              ▼                ▼                ▼                │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│   │ UST1/LUNC    │  │ UST1/wBTC    │  │ UST1/wETH    │        │
│   │ Pool         │  │ Pool         │  │ Pool         │        │
│   └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                 │
│   Benefits:                                                     │
│   • Single deposit, diversified exposure                        │
│   • Curator expertise for allocation                            │
│   • Auto-rebalancing across pools                               │
│   • Reduced gas for users (batch operations)                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation**:
- Two-layer architecture: Core pools + Vault layer
- Vaults are permissionlessly created by "curators"
- Curators define allocation strategies and earn fees
- Users deposit into vaults for simplified experience
- Core pools remain directly accessible for advanced users

### Pain Point 5: Poor Price Discovery in Low-Liquidity Markets

**Problem**: In markets with sparse bucket coverage, large gaps between buckets create arbitrage opportunities and price discontinuities.

**Our Solution: Continuous Bucket Pricing with Dynamic Spreads**

```
┌─────────────────────────────────────────────────────────────────┐
│              CONTINUOUS BUCKET SYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Traditional Discrete Buckets:                                 │
│                                                                 │
│   Price │  ████                                                │
│         │  ████     ████                                       │
│         │  ████     ████         ████                          │
│         │  ████     ████    │    ████                          │
│         └──1.00─────0.95───GAP───0.85────────────────────       │
│                            ↑                                    │
│                     Gap = price discontinuity                   │
│                                                                 │
│   Continuous Bucket System:                                     │
│                                                                 │
│   Price │  ████████████████████████████                        │
│         │  █████████████████████████████████                   │
│         │  ███████████████████████████████████████             │
│         └──1.00─────0.95─────0.90─────0.85────────────          │
│                                                                 │
│   • Buckets at 0.1% increments (1000 buckets per 100%)         │
│   • Virtual liquidity fills gaps based on adjacent buckets     │
│   • Spread widens in low-liquidity zones                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation**:
- 1000 buckets per 100% price range (0.1% granularity)
- Virtual liquidity algorithm fills gaps proportionally
- Borrowers see continuous price curve, not discrete buckets
- Spread (borrow rate premium) increases in sparse zones
- Incentivizes liquidity provision at underserved price levels

### Pain Point 6: Frozen Liquidity During Liquidations

**Problem**: Ajna freezes deposits for 6+ hours during liquidations, creating withdrawal uncertainty for lenders.

**Our Solution: Waterfall Withdrawal with Priority Queues**

```
┌─────────────────────────────────────────────────────────────────┐
│                WATERFALL WITHDRAWAL SYSTEM                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Withdrawal Request: 10,000 UST1                               │
│                                                                 │
│   Step 1: Check Immediately Available                           │
│   ┌─────────────────────────────────────────┐                  │
│   │ Unborrowed liquidity in bucket: 8,000   │ ← Instant        │
│   └─────────────────────────────────────────┘                  │
│                    │                                            │
│                    ▼                                            │
│   Step 2: Remaining 2,000 UST1                                  │
│   ┌─────────────────────────────────────────┐                  │
│   │ Priority withdrawal queue               │                  │
│   │ • Position marked for exit              │                  │
│   │ • Next borrower repayment goes to you   │ ← 0-24 hrs      │
│   │ • OR liquidation proceeds flow to you   │                  │
│   └─────────────────────────────────────────┘                  │
│                    │                                            │
│                    ▼                                            │
│   Step 3: Fallback (if Step 2 takes >24 hrs)                   │
│   ┌─────────────────────────────────────────┐                  │
│   │ Collateral claim option                 │                  │
│   │ • Claim equivalent collateral           │ ← After 24 hrs  │
│   │ • At lending price (guaranteed floor)   │                  │
│   └─────────────────────────────────────────┘                  │
│                                                                 │
│   Benefits:                                                     │
│   • Partial instant liquidity always available                  │
│   • Predictable maximum wait time (24 hrs)                      │
│   • Guaranteed exit via collateral claim                        │
│   • No "stuck" positions                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    UST1 MONEY MARKET ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                         USER LAYER                              │   │
│   │                                                                 │   │
│   │   Lenders          Borrowers         Liquidators    Curators   │   │
│   │   (deposit)        (borrow)          (clear debt)   (vaults)   │   │
│   └────────┬─────────────┬────────────────┬──────────────┬─────────┘   │
│            │             │                │              │             │
│            ▼             ▼                ▼              ▼             │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                     VAULT LAYER (Optional)                      │   │
│   │                                                                 │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │   │
│   │   │ UST1 Yield  │  │ LUNC Yield  │  │ Custom      │           │   │
│   │   │ Vault       │  │ Vault       │  │ Strategy    │           │   │
│   │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │   │
│   └──────────┼────────────────┼────────────────┼────────────────────┘   │
│              │                │                │                        │
│              ▼                ▼                ▼                        │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        CORE LAYER                               │   │
│   │                                                                 │   │
│   │   ┌───────────────────────────────────────────────────────────┐│   │
│   │   │                    POOL FACTORY                           ││   │
│   │   │  Creates and registers new lending pools                  ││   │
│   │   └───────────────────────────────────────────────────────────┘│   │
│   │              │                                                  │   │
│   │              ▼                                                  │   │
│   │   ┌───────────────────────────────────────────────────────────┐│   │
│   │   │                  ISOLATED POOLS                           ││   │
│   │   │                                                           ││   │
│   │   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     ││   │
│   │   │   │ UST1/LUNC   │  │ UST1/wBTC   │  │ UST1/CW20-X │     ││   │
│   │   │   │ Pool        │  │ Pool        │  │ Pool        │     ││   │
│   │   │   │             │  │             │  │             │     ││   │
│   │   │   │ Buckets     │  │ Buckets     │  │ Buckets     │     ││   │
│   │   │   │ Positions   │  │ Positions   │  │ Positions   │     ││   │
│   │   │   │ Auctions    │  │ Auctions    │  │ Auctions    │     ││   │
│   │   │   └─────────────┘  └─────────────┘  └─────────────┘     ││   │
│   │   │                                                           ││   │
│   │   └───────────────────────────────────────────────────────────┘│   │
│   │                                                                 │   │
│   │   ┌───────────────────────────────────────────────────────────┐│   │
│   │   │                  LIQUIDATION ENGINE                       ││   │
│   │   │  Manages Dutch auctions across all pools                  ││   │
│   │   └───────────────────────────────────────────────────────────┘│   │
│   │                                                                 │   │
│   │   ┌───────────────────────────────────────────────────────────┐│   │
│   │   │                  INTEREST RATE MODEL                      ││   │
│   │   │  Calculates rates based on utilization                    ││   │
│   │   └───────────────────────────────────────────────────────────┘│   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    EXTERNAL INTEGRATIONS                        │   │
│   │                                                                 │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │   │
│   │   │ USTR CMM    │  │ DEX         │  │ IBC         │           │   │
│   │   │ Treasury    │  │ (Liquidity) │  │ (Bridged    │           │   │
│   │   │ (UST1)      │  │             │  │  Assets)    │           │   │
│   │   └─────────────┘  └─────────────┘  └─────────────┘           │   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Contract Hierarchy

```
                    ┌─────────────────────┐
                    │   Protocol Admin    │
                    │   (Timelock + DAO)  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Pool Factory      │
                    │   - Create pools    │
                    │   - Register pools  │
                    │   - Set fee params  │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │ Pool        │     │ Pool        │     │ Pool        │
    │ UST1/LUNC   │     │ UST1/wBTC   │     │ UST1/wETH   │
    │             │     │             │     │             │
    │ - Buckets   │     │ - Buckets   │     │ - Buckets   │
    │ - Positions │     │ - Positions │     │ - Positions │
    │ - Loans     │     │ - Loans     │     │ - Loans     │
    └─────────────┘     └─────────────┘     └─────────────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Liquidation Engine  │
                    │ (Shared)            │
                    │ - Dutch auctions    │
                    │ - Kicker rewards    │
                    │ - MEV protection    │
                    └─────────────────────┘
                               │
                               │
                    ┌─────────────────────┐
                    │ Interest Rate Model │
                    │ (Shared)            │
                    │ - Utilization calc  │
                    │ - Rate curves       │
                    └─────────────────────┘
```

---

## Core Mechanisms

### Bucket System

Each pool contains **1000 price buckets** spanning from 0.01x to 10x of the initial reference price:

```
┌─────────────────────────────────────────────────────────────────┐
│                      BUCKET STRUCTURE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Bucket Index    Price (UST1/Collateral)    Liquidity         │
│   ─────────────────────────────────────────────────────────    │
│   999             10.0000                    0 UST1            │
│   998             9.9900                     0 UST1            │
│   ...             ...                        ...               │
│   500             1.0000                     50,000 UST1       │
│   499             0.9990                     45,000 UST1       │
│   498             0.9980                     42,000 UST1       │
│   ...             ...                        ...               │
│   250             0.5000                     10,000 UST1       │
│   ...             ...                        ...               │
│   0               0.0100                     0 UST1            │
│                                                                 │
│   Formula: price(i) = 0.01 * (1.001)^i                         │
│                                                                 │
│   This creates exponential spacing:                             │
│   - Dense coverage near current price                           │
│   - Sparse coverage at extremes                                 │
│   - Natural volatility adaptation                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Lender Positions

Lenders deposit quote tokens (UST1) at specified price ranges:

| Field | Type | Description |
|-------|------|-------------|
| `lender` | `Addr` | Lender's address |
| `bucket_range` | `(u16, u16)` | (low_bucket, high_bucket) inclusive |
| `deposited` | `Uint128` | Total quote tokens deposited |
| `utilized` | `Uint128` | Amount currently lent to borrowers |
| `lp_shares` | `Uint128` | Share of bucket liquidity (for interest) |
| `deposit_time` | `Timestamp` | When position was created |

### Borrower Positions

Borrowers deposit collateral and borrow quote tokens:

| Field | Type | Description |
|-------|------|-------------|
| `borrower` | `Addr` | Borrower's address |
| `collateral` | `Uint128` | Collateral tokens deposited |
| `debt` | `Uint128` | Quote tokens borrowed (principal) |
| `accrued_interest` | `Uint128` | Accumulated interest owed |
| `threshold_bucket` | `u16` | Bucket index where position becomes liquidatable |
| `borrow_time` | `Timestamp` | When loan was taken |

### Collateralization Mechanics

Borrowers draw liquidity from buckets, starting from the highest price (most favorable to borrower):

```
┌─────────────────────────────────────────────────────────────────┐
│                   BORROWING MECHANICS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Borrower deposits: 1000 LUNC as collateral                    │
│   Wants to borrow: 500 UST1                                     │
│                                                                 │
│   System calculates:                                            │
│                                                                 │
│   Step 1: Find available buckets (highest first)                │
│   ┌────────────────────────────────────────────────────────┐   │
│   │ Bucket 500 (1.0 UST1/LUNC): 200 UST1 available        │   │
│   │ Bucket 499 (0.999 UST1/LUNC): 180 UST1 available      │   │
│   │ Bucket 498 (0.998 UST1/LUNC): 150 UST1 available      │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Step 2: Draw liquidity from top buckets                       │
│   ┌────────────────────────────────────────────────────────┐   │
│   │ From Bucket 500: Draw 200 UST1                         │   │
│   │ From Bucket 499: Draw 180 UST1                         │   │
│   │ From Bucket 498: Draw 120 UST1                         │   │
│   │ Total borrowed: 500 UST1                               │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Step 3: Calculate threshold bucket                            │
│   ┌────────────────────────────────────────────────────────┐   │
│   │ Collateral value at Bucket 498: 1000 × 0.998 = 998 UST1│   │
│   │ Debt: 500 UST1                                         │   │
│   │ LTV: 500/998 = 50.1%                                   │   │
│   │                                                        │   │
│   │ Threshold bucket = lowest bucket where debt can be     │   │
│   │ covered = Bucket 498 (position is healthy)             │   │
│   │                                                        │   │
│   │ If collateral price drops below 0.5 UST1/LUNC,        │   │
│   │ position becomes liquidatable                          │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pool Types & Configuration

### Pool Creation (Permissionless)

Anyone can create a new lending pool by specifying:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `quote_token` | Token being lent (typically UST1) | UST1 |
| `collateral_token` | Token used as collateral | LUNC, wBTC, etc. |
| `initial_bucket` | Starting reference bucket index | 500 (1.0 price) |
| `interest_rate_model` | IRM contract address | Default or custom |

### Canonical Pool Types

The protocol establishes "canonical" pools for major pairs:

| Pool | Quote | Collateral | Use Case |
|------|-------|------------|----------|
| UST1/LUNC | UST1 | LUNC | Native TerraClassic lending |
| UST1/wBTC | UST1 | Wrapped BTC | BTC-backed UST1 loans |
| UST1/wETH | UST1 | Wrapped ETH | ETH-backed UST1 loans |
| UST1/USTR | UST1 | USTR | USTR leverage positions |
| LUNC/UST1 | LUNC | UST1 | Inverse lending (earn LUNC) |

### Pool Parameters

Each pool has immutable and configurable parameters:

**Immutable (Set at Creation)**:
- Quote token address
- Collateral token address
- Bucket count (1000)
- Bucket spacing (0.1%)

**Configurable (Governance)**:
- Protocol fee (% of interest, default 10%)
- Liquidation penalty (% bonus to liquidators, default 5%)
- Minimum debt (dust prevention, default 10 UST1)
- Auction parameters (decay rate, duration)

---

## Liquidation Engine

### When Positions Become Liquidatable

A position is liquidatable when the collateral value at the current market-implied price falls below the debt:

```
Collateral × Market_Price < Debt × (1 + Maintenance_Margin)

Where:
- Market_Price = price of highest bucket with active borrows
- Maintenance_Margin = configurable buffer (e.g., 5%)
```

### Liquidation Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIQUIDATION FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Phase 1: KICK (Initiation)                                    │
│   ─────────────────────────────────────────────────────────    │
│   • Any address can call `kick(borrower_addr)`                  │
│   • Contract verifies position is underwater                    │
│   • Auction created with starting price = 120% of debt          │
│   • Kicker posts small bond (refunded + reward on success)      │
│   • 2-block delay before takes allowed (MEV protection)         │
│   • Kicker reward: 0.5-2% of debt (scales with how early)       │
│                                                                 │
│   Phase 2: AUCTION (Dutch Auction)                              │
│   ─────────────────────────────────────────────────────────    │
│   • Price decays exponentially over 24 hours                    │
│   • Decay rate adapts based on collateral volatility            │
│   • Takers call `take(auction_id, amount)`                      │
│   • Partial takes allowed (minimum 10% of remaining)            │
│   • Pro-rata sharing if multiple takes in same block            │
│                                                                 │
│   Phase 3: SETTLEMENT                                           │
│   ─────────────────────────────────────────────────────────    │
│   • Taker receives collateral at auction price                  │
│   • Quote tokens repay lenders (prioritized by bucket)          │
│   • Kicker bond refunded + reward paid                          │
│   • Excess collateral (if any) returned to borrower             │
│   • If auction clears below debt: bad debt socialized           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Adaptive Decay Rate

The auction decay rate adjusts based on collateral volatility:

| Collateral Type | Volatility Profile | Decay Halflife |
|-----------------|-------------------|----------------|
| Stablecoins | Very Low | 8 hours |
| Major Crypto (BTC, ETH) | Medium | 4 hours |
| Alt Coins | High | 2 hours |
| New/Unknown | Very High | 1 hour |

Volatility is measured as the standard deviation of bucket-implied price movements over the trailing 7 days.

### Bad Debt Handling

If an auction fails to cover the debt:

1. **First Line**: Lenders in affected buckets absorb losses proportionally
2. **Second Line**: Protocol reserve (from accumulated fees) covers shortfall
3. **Third Line**: Remaining bad debt marked as protocol liability, repaid from future fees

This ensures no sudden socialization of losses while maintaining protocol solvency path.

---

## Interest Rate Model

### Utilization-Based Rates

Interest rates are determined algorithmically based on pool utilization:

```
┌─────────────────────────────────────────────────────────────────┐
│                  INTEREST RATE CURVE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   APR                                                           │
│    ▲                                                            │
│  200%│                                          ●               │
│      │                                        ●                 │
│      │                                      ●                   │
│  100%│                                    ●  ← Kink (90%)       │
│      │                               ●●●●                       │
│      │                         ●●●●●                            │
│   50%│                   ●●●●●                                  │
│      │             ●●●●●                                        │
│      │       ●●●●●                                              │
│   10%│ ●●●●●                                                    │
│      │                                                          │
│    0%└──────────────────────────────────────────────────────►   │
│       0%      25%      50%      75%     90%     100%            │
│                         Utilization                             │
│                                                                 │
│   Formula (Two-slope model):                                    │
│                                                                 │
│   If utilization ≤ kink:                                        │
│     rate = base_rate + (utilization / kink) × slope1            │
│                                                                 │
│   If utilization > kink:                                        │
│     rate = kink_rate + ((util - kink) / (1 - kink)) × slope2   │
│                                                                 │
│   Default Parameters:                                           │
│   • base_rate = 2% APR                                          │
│   • kink = 90%                                                  │
│   • slope1 = 48% (rate at kink = 50%)                           │
│   • slope2 = 150% (rate at 100% = 200%)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Per-Bucket Interest Accrual

Interest accrues per bucket based on that bucket's utilization:

- Lenders in high-utilization buckets earn more
- This incentivizes liquidity at price levels with borrower demand
- Interest compounds per-block (or per-second on CosmWasm)

### Interest Distribution

| Recipient | Share | Purpose |
|-----------|-------|---------|
| Lenders | 90% | Depositor yield |
| Protocol | 10% | Treasury, reserves |

---

## Governance & Parameters

### Governance Scope

This protocol maintains **minimal governance** to preserve trustlessness:

**Governance CAN**:
- Adjust protocol fee (within bounds: 0-20%)
- Adjust liquidation penalty (within bounds: 1-15%)
- Add new interest rate models
- Whitelist/denylist vault curators
- Manage protocol treasury
- Emergency pause (with timelock)

**Governance CANNOT**:
- Change prices or buckets
- Modify individual pool parameters after creation
- Freeze user funds without timelock
- Set interest rates directly

### Governance Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                   GOVERNANCE TIMELINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Phase 1: Admin Multisig                                       │
│   ─────────────────────────────────────────────────────────    │
│   • 3-of-5 multisig controls protocol parameters                │
│   • 48-hour timelock on all changes                             │
│   • Emergency pause: 6-hour timelock                            │
│                                                                 │
│   Phase 2: DAO Transition                                       │
│   ─────────────────────────────────────────────────────────    │
│   • Governance token distribution (TBD)                         │
│   • On-chain voting for parameter changes                       │
│   • 7-day timelock on passed proposals                          │
│   • Multisig retains emergency powers only                      │
│                                                                 │
│   Phase 3: Full Decentralization                                │
│   ─────────────────────────────────────────────────────────    │
│   • Multisig powers removed                                     │
│   • All changes via DAO vote                                    │
│   • Immutable core contracts                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Risk Framework

### Protocol-Level Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Smart contract bug | Critical | Medium | Audits, formal verification, bug bounty |
| Bad debt cascade | High | Low | Isolated pools, conservative LTVs, reserves |
| Liquidation failure | High | Low | Adaptive auctions, kicker incentives |
| Governance attack | High | Low | Timelocks, limited scope, emergency pause |
| Low liquidity | Medium | Medium | Vault incentives, bucket aggregation |

### Pool-Level Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Collateral price crash | High | Medium | No mitigation (lenders accept risk) |
| Bucket concentration | Medium | Medium | Multi-bucket deposits, risk tiers |
| Utilization spike | Medium | High | Dynamic interest rates |
| Flash loan attacks | High | Medium | Multi-block settlement, no oracles |

### User-Level Risks

**Lenders**:
- May receive collateral instead of quote tokens if borrowers default
- Collateral received at their specified lending price (worst case = lending price)
- Interest may be lower than expected if utilization is low

**Borrowers**:
- Position can be liquidated if collateral value drops
- Interest rates can spike if pool utilization increases
- Must monitor position health (no automatic notifications on-chain)

### Risk Disclosure Framework

The frontend will prominently display:

1. **Pool Risk Score** (A-F rating based on liquidity depth, historical volatility, utilization)
2. **Position Health Indicator** (green/yellow/red for borrowers)
3. **Expected vs. Historical APY** (for lenders)
4. **Liquidation Price** (for borrowers)

---

## User Experience Design

### Simplified Lender Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   LENDER EXPERIENCE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Step 1: Select Pool                                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  💰 UST1 Lending Markets                                │   │
│   │                                                         │   │
│   │  ┌─────────────────────────────────────────────────┐   │   │
│   │  │ UST1 → LUNC Pool                                │   │   │
│   │  │ TVL: $2.5M | APY: 8.5% | Utilization: 72%      │   │   │
│   │  └─────────────────────────────────────────────────┘   │   │
│   │                                                         │   │
│   │  ┌─────────────────────────────────────────────────┐   │   │
│   │  │ UST1 → wBTC Pool                                │   │   │
│   │  │ TVL: $1.2M | APY: 6.2% | Utilization: 58%      │   │   │
│   │  └─────────────────────────────────────────────────┘   │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Step 2: Choose Risk Tier                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Select your risk preference:                           │   │
│   │                                                         │   │
│   │  ○ 🟢 Conservative (5-7% APY)                          │   │
│   │      "First in line for repayment"                      │   │
│   │                                                         │   │
│   │  ● 🟡 Moderate (8-12% APY)                             │   │
│   │      "Balanced risk and reward"                         │   │
│   │                                                         │   │
│   │  ○ 🔴 Aggressive (15-25% APY)                          │   │
│   │      "Higher yield, may receive collateral"             │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Step 3: Deposit Amount                                        │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Deposit UST1                                           │   │
│   │  ┌────────────────────────────────────────────────┐    │   │
│   │  │ 1,000                                     UST1 │    │   │
│   │  └────────────────────────────────────────────────┘    │   │
│   │                                                         │   │
│   │  Estimated APY: 10.2%                                   │   │
│   │  Worst-case outcome: Receive LUNC at 0.85 UST1/LUNC    │   │
│   │                                                         │   │
│   │  [Deposit] [Advanced Options ▼]                        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Simplified Borrower Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   BORROWER EXPERIENCE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Step 1: Select Collateral & Loan                              │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Deposit Collateral                                     │   │
│   │  ┌────────────────────────────────────────────────┐    │   │
│   │  │ 10,000                                    LUNC │    │   │
│   │  └────────────────────────────────────────────────┘    │   │
│   │                                                         │   │
│   │  Borrow UST1                                            │   │
│   │  ┌────────────────────────────────────────────────┐    │   │
│   │  │ 5,000                                     UST1 │    │   │
│   │  └────────────────────────────────────────────────┘    │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Step 2: Review Position                                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  📊 Position Summary                                    │   │
│   │                                                         │   │
│   │  Collateral:        10,000 LUNC                        │   │
│   │  Collateral Value:  9,500 UST1 (@ 0.95 UST1/LUNC)     │   │
│   │  Loan Amount:       5,000 UST1                         │   │
│   │  LTV:               52.6%                              │   │
│   │  Liquidation Price: 0.55 UST1/LUNC                    │   │
│   │  Interest Rate:     12.5% APR                          │   │
│   │                                                         │   │
│   │  ⚠️ Health: Good (47.4% buffer to liquidation)         │   │
│   │  [████████████████████░░░░░░░░░░] 52.6%                │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Step 3: Confirm                                               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  [Borrow 5,000 UST1]                                   │   │
│   │                                                         │   │
│   │  By confirming, you acknowledge:                        │   │
│   │  • Position can be liquidated if LUNC drops below      │   │
│   │    0.55 UST1/LUNC                                      │   │
│   │  • Interest accrues continuously                        │   │
│   │  • No automatic notifications for price changes         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Advanced Mode

Power users can access the full bucket interface:

- View all 1000 buckets with liquidity depth
- Place deposits at specific buckets (not risk tiers)
- View utilization per bucket
- Manage multiple positions across pools
- Access liquidation interface for kicking/taking

---

## Integration with USTR CMM

### UST1 as Primary Quote Token

The money market is designed around UST1 as the primary unit of account:

```
┌─────────────────────────────────────────────────────────────────┐
│                  UST1 ECOSYSTEM INTEGRATION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    USTR CMM TREASURY                    │   │
│   │                                                         │   │
│   │   Holds USTC + diversified collateral backing UST1      │   │
│   │   CR tiers control UST1 minting/redemption              │   │
│   │                                                         │   │
│   └────────────────────────┬────────────────────────────────┘   │
│                            │                                    │
│                            │ UST1 minting (when CR > 190%)     │
│                            ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   MONEY MARKET                          │   │
│   │                                                         │   │
│   │   UST1 Lending:                                         │   │
│   │   • Lend UST1 to earn yield                             │   │
│   │   • Borrow UST1 against crypto collateral               │   │
│   │                                                         │   │
│   │   USTR Integration:                                      │   │
│   │   • USTR as collateral for UST1 loans                   │   │
│   │   • USTR staking rewards from money market fees         │   │
│   │                                                         │   │
│   └────────────────────────┬────────────────────────────────┘   │
│                            │                                    │
│                            │ Interest + fees                   │
│                            ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │               FEE DISTRIBUTION                          │   │
│   │                                                         │   │
│   │   70% → Lenders (as interest)                           │   │
│   │   15% → Protocol treasury                               │   │
│   │   10% → USTR staking rewards                            │   │
│   │    5% → Bad debt reserve                                │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### USTR Utility in Money Market

1. **Collateral**: USTR can be used as collateral to borrow UST1
2. **Staking Rewards**: USTR stakers receive portion of money market fees
3. **Governance**: Future governance rights over money market parameters
4. **Vault Curator Stakes**: Curators may need to stake USTR as skin-in-the-game

### UST1 Demand Drivers

The money market creates organic demand for UST1:

| Use Case | Demand Type |
|----------|-------------|
| Lending pools | Lenders deposit UST1 to earn yield |
| Borrowing | Borrowers seek UST1 for various uses |
| Vault deposits | Aggregated UST1 yield strategies |
| Liquidation settlement | Quote token for all settlements |

---

## Development Phases

### Phase 1: Core Protocol

**Scope**:
- Pool factory contract
- Basic pool contract (1000 buckets)
- Lender deposit/withdraw
- Borrower collateral/borrow/repay
- Basic liquidation (Dutch auction)
- Interest rate model

**Deliverables**:
- 4 core contracts
- Unit tests (100% coverage)
- Integration tests
- Testnet deployment

### Phase 2: Enhanced Liquidations

**Scope**:
- Adaptive decay rate auctions
- MEV protection (multi-block)
- Kicker reward system
- Partial liquidations
- Bad debt handling

**Deliverables**:
- Upgraded liquidation engine
- Kicker incentive contract
- Reserve pool contract

### Phase 3: User Experience Layer

**Scope**:
- Risk tier system (Conservative/Moderate/Aggressive)
- Smart bucket aggregation
- Waterfall withdrawals
- Frontend application
- Position management dashboard

**Deliverables**:
- UX abstraction contracts
- Web frontend
- Mobile-responsive design

### Phase 4: Vault Layer

**Scope**:
- Vault factory contract
- Curator registration
- Allocation strategies
- Auto-rebalancing
- Vault frontend

**Deliverables**:
- Vault contracts
- Curator interface
- Vault discovery/deposit UI

### Phase 5: Ecosystem Integration

**Scope**:
- USTR staking integration
- DEX integrations (for liquidators)
- IBC asset support
- Cross-chain vault strategies

**Deliverables**:
- Integration contracts
- Liquidation bot templates
- Documentation

---

## Security Considerations

### Smart Contract Security

1. **Audit Requirements**:
   - Internal code review for each phase
   - External audit before mainnet (Phases 1-2)
   - Follow-up audit for vault layer (Phase 4)

2. **Formal Verification**:
   - Core invariants (bucket sums, position tracking)
   - Interest accrual calculations
   - Liquidation price calculations

3. **Testing Strategy**:
   - Unit tests: 100% coverage
   - Integration tests: All user flows
   - Fuzz testing: Random inputs, boundary conditions
   - Simulation: Multi-agent market simulations

### Operational Security

1. **Timelocks**:
   - 48-hour timelock on parameter changes
   - 6-hour timelock on emergency pause
   - 7-day timelock on governance address changes

2. **Emergency Procedures**:
   - Pause new borrows (preserves existing)
   - Pause new deposits
   - Full pause (all operations except withdrawals)

3. **Monitoring**:
   - On-chain event monitoring
   - Utilization alerts
   - Liquidation queue monitoring
   - Bad debt tracking

### Known Limitations

1. **No Oracle = No External Price Reference**:
   - Market price derived from lender behavior
   - May diverge from external exchange prices
   - Arbitrageurs naturally align prices over time

2. **Bucket Gaps**:
   - Low liquidity at some price levels possible
   - Mitigated by virtual liquidity and spread widening
   - Not a security issue, but affects UX

3. **Liquidation Latency**:
   - No instant liquidations (by design)
   - Minimum 2-block delay + auction duration
   - Extreme volatility may cause bad debt

---

## Future Extensions

### Near-Term

1. **Flash Loans**: Enable flash borrowing from unused pool liquidity
2. **Position NFTs**: Represent positions as transferable NFTs
3. **Cross-Pool Collateral**: Use LP tokens from one pool as collateral in another
4. **Rate Caps**: Optional borrower rate caps (with premium)

### Medium-Term

1. **Structured Products**: Fixed-term, fixed-rate lending vaults
2. **Options Integration**: Use money market liquidity for covered calls
3. **Leveraged Yield Farming**: One-click leverage strategies via vaults
4. **Cross-Chain Expansion**: Deploy on other Cosmos chains via IBC

### Long-Term

1. **Real-World Asset Pools**: RWA-collateralized lending (requires selective oracle integration)
2. **Institutional Features**: Prime brokerage, custody integrations
3. **Fiat On-Ramp**: Direct fiat → UST1 → lending flow
4. **Credit Scoring**: Reputation-based undercollateralized lending (optional)

---

## Conclusion

The UST1 Money Market represents a next-generation lending protocol designed specifically for the TerraClassic ecosystem. By building on the oracle-free principles pioneered by Ajna while addressing known pain points, the protocol offers:

1. **Trustless Operation**: No external price dependencies or governance-set prices
2. **Capital Efficiency**: Smart bucket aggregation and vault layer reduce fragmentation
3. **Accessible UX**: Risk tiers abstract complexity while preserving power-user access
4. **Robust Liquidations**: Adaptive auctions with MEV protection ensure protocol solvency
5. **Deep UST1 Integration**: Synergistic relationship with USTR CMM ecosystem

The phased development approach ensures each component is thoroughly tested before expansion, culminating in a comprehensive DeFi primitive that serves as foundational infrastructure for the TerraClassic ecosystem.

---

*Document prepared for USTR CMM project. Subject to revision based on community feedback and technical discoveries during development.*
