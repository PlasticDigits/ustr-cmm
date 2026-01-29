# CMM Swaps & Auctions Proposal: Cross-Chain FDUSD Swaps and Gamified English Auctions

## Executive Summary

A fully on-chain marketplace for TerraClassic featuring two primary mechanisms: **FDUSD Cross-Chain Swaps** using Venus-staked FDUSD from BNB Smart Chain (BSC), and **Gamified English Auctions** for assets without reliable oracle pricing. The system operates with a static frontend and no backend API services, leveraging existing CMM Treasury and Governance infrastructure.

> **Important**: This system assumes the CMM Treasury and Governance contracts are already deployed and operational. All permissions, parameter updates, and treasury operations flow through the existing governance framework.

### Key Differentiators

- **Cross-Chain FDUSD Liquidity**: Bridge Venus-staked FDUSD (vFDUSD) from BSC to TerraClassic
- **Low-Risk Oracle Design**: FDUSD's stable nature (±0.1% typical variance) minimizes oracle risk
- **Symmetric Fee Model**: 3.5% fees on both buy and sell sides, maintaining a controlled price range
- **Governance-Controlled Parameters**: All fees and rate parameters adjustable via governance
- **Oracle-Free Auctions**: English auctions provide price discovery without external oracles
- **Gamified Mechanics**: Achievement system, streak bonuses, and prize pools make auctions engaging
- **Fully On-Chain**: All logic executes on TerraClassic with no backend dependencies
- **Static Frontend**: IPFS-hosted UI with direct chain queries

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [FDUSD Swap System](#2-fdusd-swap-system)
3. [Cross-Chain Bridge & Oracle](#3-cross-chain-bridge--oracle)
4. [English Auction System](#4-english-auction-system)
5. [Gamification Layer](#5-gamification-layer)
6. [Smart Contract Design](#6-smart-contract-design)
7. [Static Frontend Architecture](#7-static-frontend-architecture)
8. [Governance Integration](#8-governance-integration)
9. [Security Considerations](#9-security-considerations)
10. [Risk Analysis](#10-risk-analysis)
11. [Implementation Phases & Timeline](#11-implementation-phases--timeline)

---

## 1. Architecture Overview

### 1.1 High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATIC FRONTEND (IPFS/Arweave)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Swap UI    │  │  Auction    │  │  Profile &  │  │   Leaderboard &     │ │
│  │  (FDUSD)    │  │  Gallery    │  │  Achievements│  │   Prize History     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                     Direct Chain Queries (LCD/RPC)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TERRACLASSIC BLOCKCHAIN                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         CMM CONTROLLER CONTRACT                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │  Swap Router │ Auction Engine │ Achievement Tracker │ Prizes   │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│         │              │                │               │                    │
│  ┌──────┴──────┐ ┌─────┴─────┐ ┌────────┴────────┐ ┌────┴────────┐         │
│  │   FDUSD     │ │  Auction  │ │   Gamification  │ │   Oracle    │         │
│  │   Pool      │ │  Registry │ │     State       │ │   Hub       │         │
│  └─────────────┘ └───────────┘ └─────────────────┘ └─────────────┘         │
│         │                                                   │               │
│         │              EXISTING INFRASTRUCTURE              │               │
│  ┌──────┴──────────────────────────────────────────────────┴──────┐        │
│  │                     CMM TREASURY CONTRACT                       │        │
│  │  • Holds all protocol assets    • Governance-controlled         │        │
│  │  • 7-day timelock operations    • Multi-sig compatible          │        │
│  └─────────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│   BNB SMART CHAIN (BSC)         │   │   CL8Y ORACLE SERVICE               │
│  ┌────────────────────────────┐ │   │  ┌─────────────────────────────────┐│
│  │  Venus Protocol            │ │   │  │  FDUSD Price Attestation       ││
│  │  • vFDUSD Staking          │ │   │  │  • Multi-source aggregation    ││
│  │  • Yield Generation        │ │   │  │  • Signed price feeds          ││
│  │                            │ │   │  │  • Staleness detection         ││
│  └────────────────────────────┘ │   │  └─────────────────────────────────┘│
│  ┌────────────────────────────┐ │   └─────────────────────────────────────┘
│  │  Bridge Escrow Contract    │ │
│  │  • Lock/Unlock vFDUSD      │ │
│  │  • Governance-controlled   │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
```

### 1.2 Core Design Principles

| Principle | Description |
|-----------|-------------|
| **Fully On-Chain** | All swap logic, auction mechanics, and prize distribution execute on TerraClassic |
| **No Backend API** | Frontend queries chain state directly; no centralized services |
| **Static Hosting** | UI deployed to IPFS/Arweave for censorship resistance |
| **Governance-First** | All parameters configurable via existing CMM governance |
| **Oracle Minimalism** | Only FDUSD (low-risk stable) uses oracle; auctions are oracle-free |
| **Treasury Integration** | All revenue flows to existing CMM Treasury |

### 1.3 Dependency on Existing Infrastructure

This proposal assumes the following are already deployed and operational:

- **CMM Treasury Contract**: Holds protocol assets, executes approved transactions
- **CMM Governance System**: CL8Y node-based voting for parameter changes
- **USTR/UST1 Tokens**: CW20 tokens for ecosystem integration

---

## 2. FDUSD Swap System

### 2.1 Overview

The FDUSD Swap system enables users to exchange between wrapped FDUSD (wFDUSD) on TerraClassic and native ecosystem tokens (USTC, USTR, UST1). The system sources liquidity from Venus-staked FDUSD on BSC, providing real dollar-backed assets to the TerraClassic ecosystem.

### 2.2 Why FDUSD?

| Attribute | FDUSD Advantage |
|-----------|-----------------|
| **Stability** | FDUSD maintains tight $1.00 peg (±0.1% typical variance) |
| **Regulatory** | First USD Stablecoin licensed in Hong Kong |
| **Reserve Transparency** | Monthly attestations by Prescient Assurance |
| **Venus Integration** | Native yield through Venus Protocol staking |
| **Low Oracle Risk** | Minimal price volatility reduces manipulation risk |

### 2.3 Fee Structure

The swap system implements a symmetric fee model with 3.5% fees on both sides:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FDUSD SWAP FEE MODEL                                 │
│                                                                              │
│   BUY wFDUSD (with USTC/UST1):                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  User sends: 100 USTC                                                │   │
│   │  Fee (3.5%): 3.5 USTC → Treasury                                    │   │
│   │  Net exchange: 96.5 USTC @ oracle rate → wFDUSD                     │   │
│   │  User receives: ~96.5 wFDUSD (minus any oracle spread)              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   SELL wFDUSD (for USTC/UST1):                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  User sends: 100 wFDUSD                                              │   │
│   │  Fee (3.5%): 3.5 wFDUSD → Treasury                                  │   │
│   │  Net exchange: 96.5 wFDUSD @ oracle rate → USTC                     │   │
│   │  User receives: ~96.5 USTC (minus any oracle spread)                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   EFFECTIVE RANGE: ~93% of value on round-trip (1 - 0.035)² = 93.12%        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Governance-Controlled Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `buy_fee_bps` | 350 (3.5%) | 0-1000 | Fee on purchasing wFDUSD |
| `sell_fee_bps` | 350 (3.5%) | 0-1000 | Fee on selling wFDUSD |
| `oracle_staleness_threshold` | 300s | 60-3600 | Max age of oracle price |
| `max_slippage_bps` | 100 (1%) | 10-500 | Maximum allowed price deviation |
| `daily_swap_limit` | 100,000 wFDUSD | 0-∞ | Daily volume cap per user |
| `pause_swaps` | false | bool | Emergency pause flag |

### 2.5 Swap Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BUY wFDUSD FLOW                                      │
│                                                                              │
│   User                    Swap Contract              Oracle        Treasury  │
│    │                           │                       │              │      │
│    │ ─── SendUstc(amount) ───► │                       │              │      │
│    │                           │ ── QueryPrice ──────► │              │      │
│    │                           │ ◄─ FdusdPrice ─────── │              │      │
│    │                           │                       │              │      │
│    │                           │ ── ValidatePrice ───► │              │      │
│    │                           │    (staleness, range) │              │      │
│    │                           │                       │              │      │
│    │                           │ ── CalculateFee ────► │              │      │
│    │                           │    (3.5% to treasury) │              │      │
│    │                           │                       │              │      │
│    │                           │ ── TransferFee ─────────────────────► │     │
│    │                           │                       │              │      │
│    │                           │ ── MintWfdusd ──────► │              │      │
│    │ ◄── ReceiveWfdusd ─────── │                       │              │      │
│    │                           │                       │              │      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Cross-Chain Bridge & Oracle

### 3.1 Bridge Architecture

The cross-chain bridge connects Venus-staked FDUSD on BSC with wrapped FDUSD (wFDUSD) on TerraClassic.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CROSS-CHAIN BRIDGE ARCHITECTURE                      │
│                                                                              │
│   BNB SMART CHAIN                           TERRACLASSIC                     │
│   ┌─────────────────────────┐              ┌─────────────────────────┐      │
│   │     USER WALLET         │              │     USER WALLET         │      │
│   │   (holds FDUSD/vFDUSD)  │              │   (holds wFDUSD)        │      │
│   └───────────┬─────────────┘              └───────────▲─────────────┘      │
│               │                                         │                    │
│               │ Lock                                    │ Mint               │
│               ▼                                         │                    │
│   ┌─────────────────────────┐              ┌───────────┴─────────────┐      │
│   │   BRIDGE ESCROW         │   ─────────► │   wFDUSD TOKEN          │      │
│   │   (BSC Contract)        │   CL8Y Node  │   (CW20 on Terra)       │      │
│   │                         │   Attestation│                         │      │
│   │   • Governance multisig │   ◄───────── │   • 1:1 backed          │      │
│   │   • Lock/unlock logic   │              │   • Mint on lock        │      │
│   │   • Yield accumulation  │              │   • Burn on unlock      │      │
│   └─────────────────────────┘              └─────────────────────────┘      │
│               │                                         ▲                    │
│               │ Stake                                   │                    │
│               ▼                                         │                    │
│   ┌─────────────────────────┐              ┌───────────┴─────────────┐      │
│   │   VENUS PROTOCOL        │              │   ORACLE HUB            │      │
│   │                         │              │   (TerraClassic)        │      │
│   │   • vFDUSD yield        │              │                         │      │
│   │   • ~3-5% APY           │              │   • FDUSD price feed    │      │
│   │   • Compound interest   │              │   • Staleness checks    │      │
│   └─────────────────────────┘              └─────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Bridge Security Model

| Layer | Mechanism | Description |
|-------|-----------|-------------|
| **Escrow Control** | Governance Multisig | 3-of-5 multisig controls BSC escrow contract |
| **Attestation** | CL8Y Oracle Nodes | Distributed nodes verify lock/unlock events |
| **Rate Limiting** | Daily Caps | Maximum bridge volume per 24-hour period |
| **Timelock** | 24-hour delay | Large withdrawals require waiting period |
| **Circuit Breaker** | Auto-pause | Halts bridge if anomalies detected |

### 3.3 FDUSD Oracle Service

Given FDUSD's stability, the oracle service can be lightweight compared to volatile asset oracles.

#### 3.3.1 Price Feed Sources

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FDUSD ORACLE AGGREGATION                             │
│                                                                              │
│   PRIMARY SOURCES (weighted average):                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Source             │  Weight  │  Update Freq  │  Notes              │   │
│   │─────────────────────│──────────│───────────────│─────────────────────│   │
│   │  Binance FDUSD/USDT │   40%    │  Real-time    │  Highest liquidity  │   │
│   │  PancakeSwap AMM    │   30%    │  Per-block    │  On-chain DEX       │   │
│   │  Gate.io            │   20%    │  Real-time    │  Secondary CEX      │   │
│   │  Curve Pool         │   10%    │  Per-block    │  Stable swap        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   AGGREGATION LOGIC:                                                         │
│   • Weighted median (not mean) - resistant to outliers                      │
│   • Reject any source > 0.5% from median                                    │
│   • Require minimum 3 valid sources                                         │
│   • Default to $1.00 if all sources stale (with swap pause)                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 3.3.2 Oracle Update Mechanism

The CL8Y node network submits signed price attestations to TerraClassic:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ORACLE UPDATE FLOW                                   │
│                                                                              │
│   CL8Y Node 1        CL8Y Node 2        CL8Y Node 3         Oracle Hub      │
│       │                  │                  │                    │          │
│       │ ── Fetch prices from sources ───────────────────────────►│          │
│       │                  │                  │                    │          │
│       │ ── Sign(price, timestamp, node_id) ─────────────────────►│          │
│       │                  │                  │                    │          │
│       │                  │ ── Sign(price, timestamp, node_id) ──►│          │
│       │                  │                  │                    │          │
│       │                  │                  │ ── Sign(...) ─────►│          │
│       │                  │                  │                    │          │
│       │                  │                  │     Aggregate      │          │
│       │                  │                  │     (2-of-3 match) │          │
│       │                  │                  │                    │          │
│       │                  │                  │    Store Price     │          │
│       │                  │                  │    (valid 5 min)   │          │
│       │                  │                  │                    │          │
└─────────────────────────────────────────────────────────────────────────────┘

   Update Frequency: Every 5 minutes (or on significant deviation > 0.1%)
   Staleness Threshold: 5 minutes (configurable by governance)
   Fallback: Pause swaps if no valid price for 15 minutes
```

### 3.4 Risk Mitigation for FDUSD

| Risk | Mitigation | Impact |
|------|------------|--------|
| **Depeg Event** | Circuit breaker pauses at ±2% deviation | Prevents loss during anomaly |
| **Oracle Manipulation** | Multi-source aggregation, outlier rejection | Requires compromising multiple sources |
| **Stale Prices** | Strict staleness checks, auto-pause | Blocks trades with outdated prices |
| **Bridge Exploit** | Rate limits, timelock, multisig | Limits maximum loss per incident |

---

## 4. English Auction System

### 4.1 Overview

For assets without reliable oracle pricing (NFTs, exotic tokens, bundled assets), the system uses English auctions for price discovery. This eliminates oracle dependency while creating engaging trading experiences.

### 4.2 Why English Auctions?

| Benefit | Description |
|---------|-------------|
| **Price Discovery** | Market determines fair value through competitive bidding |
| **No Oracle Risk** | Eliminates manipulation vectors from external price feeds |
| **Transparency** | All bids visible on-chain, verifiable history |
| **Engagement** | Natural gamification through competitive bidding |
| **Flexibility** | Supports any asset type without oracle integration |

### 4.3 Auction Mechanics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENGLISH AUCTION LIFECYCLE                            │
│                                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│   │   LISTING   │───►│   ACTIVE    │───►│   ENDING    │───►│  FINALIZED  │  │
│   │             │    │   BIDDING   │    │   PERIOD    │    │             │  │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                              │
│   LISTING PHASE:                                                             │
│   • Seller deposits asset into auction contract                             │
│   • Sets: reserve price, starting bid, duration, bid increment              │
│   • Auction scheduled to start at specified time                            │
│                                                                              │
│   ACTIVE BIDDING:                                                            │
│   • Users place bids (must exceed current + min increment)                  │
│   • Outbid users automatically refunded                                     │
│   • Bid history recorded on-chain                                           │
│                                                                              │
│   ENDING PERIOD (Anti-Snipe):                                               │
│   • If bid placed in final 5 minutes, extend by 5 minutes                  │
│   • Maximum 3 extensions per auction (15 min max extension)                │
│   • Creates fair opportunity for all bidders                                │
│                                                                              │
│   FINALIZED:                                                                 │
│   • Winner claims asset, seller receives payment (minus fees)              │
│   • If no bids met reserve, asset returned to seller                       │
│   • Achievements and streaks updated                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Auction Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `min_duration` | 1 hour | 1-168 hours | Minimum auction length |
| `max_duration` | 7 days | 1-30 days | Maximum auction length |
| `min_bid_increment_bps` | 500 (5%) | 100-2000 | Minimum bid increase |
| `anti_snipe_window` | 300s (5 min) | 60-600 | Extension trigger window |
| `anti_snipe_extension` | 300s (5 min) | 60-600 | Time added per extension |
| `max_extensions` | 3 | 1-10 | Maximum anti-snipe extensions |
| `seller_fee_bps` | 250 (2.5%) | 0-1000 | Fee from seller proceeds |
| `buyer_fee_bps` | 100 (1%) | 0-500 | Fee from buyer payment |

### 4.5 Supported Auction Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUCTION TYPES                                        │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  SINGLE ASSET AUCTION                                                │   │
│   │  • One CW20 token or CW721 NFT                                       │   │
│   │  • Standard English auction mechanics                                │   │
│   │  • Most common auction type                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  BUNDLE AUCTION                                                      │   │
│   │  • Multiple assets sold together                                     │   │
│   │  • Mixed CW20/CW721 supported                                        │   │
│   │  • Winner-takes-all                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  TREASURY AUCTION                                                    │   │
│   │  • Assets sold by CMM Treasury                                       │   │
│   │  • 100% proceeds to treasury                                         │   │
│   │  • May include special incentives                                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  CHARITY AUCTION                                                     │   │
│   │  • Portion of proceeds to designated address                         │   │
│   │  • Configurable charity percentage                                   │   │
│   │  • Transparent fund routing                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Gamification Layer

### 5.1 Design Philosophy

The gamification layer transforms auctions from transactional exchanges into engaging experiences. All mechanics are fully on-chain with deterministic outcomes.

### 5.2 Achievement System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ACHIEVEMENT TIERS                                    │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  BRONZE ACHIEVEMENTS (Common)                                        │   │
│   │  • First Bid: Place your first auction bid                          │   │
│   │  • First Win: Win your first auction                                │   │
│   │  • Seller Initiate: List your first auction                         │   │
│   │  • Active Bidder: Bid on 10 different auctions                      │   │
│   │  Reward: Achievement NFT Badge                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  SILVER ACHIEVEMENTS (Uncommon)                                      │   │
│   │  • Hat Trick: Win 3 auctions in a row                               │   │
│   │  • Sniper: Win auction in final minute                              │   │
│   │  • Whale Watcher: Win auction > 10,000 UST1                         │   │
│   │  • Marathon Bidder: Bid on 100 different auctions                   │   │
│   │  Reward: Achievement NFT Badge + 5% fee discount for 1 week         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  GOLD ACHIEVEMENTS (Rare)                                            │   │
│   │  • Auction House: Win 50 total auctions                             │   │
│   │  • Comeback King: Win after being outbid 5+ times                   │   │
│   │  • Steady Hand: 10 auction win streak                               │   │
│   │  • Big Spender: Cumulative 100,000 UST1 in winning bids             │   │
│   │  Reward: Achievement NFT Badge + 10% fee discount for 1 month       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PLATINUM ACHIEVEMENTS (Legendary)                                   │   │
│   │  • Auction Titan: Win 500 total auctions                            │   │
│   │  • Unbeatable: 25 auction win streak                                │   │
│   │  • Millionaire: Cumulative 1,000,000 UST1 in winning bids           │   │
│   │  • Market Maker: List 100 auctions with 80%+ sell rate              │   │
│   │  Reward: Unique NFT + Permanent 15% fee discount + Leaderboard spot │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Streak System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WIN STREAK BONUSES                                   │
│                                                                              │
│   Streak Length       Bonus                    Prize Pool Contribution       │
│   ──────────────────────────────────────────────────────────────────────    │
│   3 wins              5% fee rebate            Entered into weekly draw      │
│   5 wins              10% fee rebate           Double weekly draw entries    │
│   10 wins             15% fee rebate           Guaranteed minor prize        │
│   25 wins             20% fee rebate           Major prize pool entry        │
│   50 wins             25% fee rebate           Grand prize pool entry        │
│                                                                              │
│   STREAK RULES:                                                              │
│   • Streak counts consecutive auction wins                                  │
│   • Streak breaks if you lose an auction after bidding                      │
│   • Listing an auction (as seller) doesn't affect streak                   │
│   • Streaks are per-wallet, tracked on-chain                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Prize Pool Mechanics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRIZE POOL SYSTEM                                    │
│                                                                              │
│   FUNDING (Automated):                                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • 10% of all auction fees → Weekly Prize Pool                      │   │
│   │  • 5% of all auction fees → Monthly Grand Prize Pool                │   │
│   │  • Unclaimed prizes roll over to next period                        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   WEEKLY PRIZE DRAW (Every Sunday 00:00 UTC):                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Eligibility: Any wallet with 3+ streak during the week            │   │
│   │  Entries: Based on streak length (higher = more entries)            │   │
│   │                                                                      │   │
│   │  Prizes:                                                             │   │
│   │  • 1st Place: 50% of weekly pool                                    │   │
│   │  • 2nd Place: 25% of weekly pool                                    │   │
│   │  • 3rd Place: 15% of weekly pool                                    │   │
│   │  • Remaining 10%: Rolled to next week                               │   │
│   │                                                                      │   │
│   │  Selection: Verifiable random (block hash + entropy)                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   MONTHLY GRAND PRIZE (First Sunday of each month):                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Eligibility: Top 100 auction volume wallets for the month          │   │
│   │                                                                      │   │
│   │  Prizes:                                                             │   │
│   │  • Grand Prize: 40% of monthly pool                                 │   │
│   │  • 2nd-5th: 10% each (40% total)                                    │   │
│   │  • 6th-10th: 2% each (10% total)                                    │   │
│   │  • Remaining 10%: Treasury                                          │   │
│   │                                                                      │   │
│   │  Selection: Weighted random by volume                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.5 Leaderboards

| Leaderboard | Ranking Criteria | Reset Period |
|-------------|------------------|--------------|
| **All-Time Volume** | Cumulative winning bid value | Never |
| **Weekly Winners** | Auctions won in current week | Weekly |
| **Current Streaks** | Active win streak length | Real-time |
| **Top Sellers** | Auction revenue generated | Monthly |
| **Achievement Leaders** | Achievement points accumulated | Never |

---

## 6. Smart Contract Design

### 6.1 Contract Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CMM AUCTION CONTRACT SUITE                           │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                         CMM CONTROLLER                                │  │
│   │  • Entry point for all user interactions                             │  │
│   │  • Routes to appropriate sub-contract                                 │  │
│   │  • Fee collection and treasury forwarding                            │  │
│   │  • Emergency pause functionality                                      │  │
│   └───────────────────────────┬──────────────────────────────────────────┘  │
│                               │                                              │
│         ┌─────────────────────┼─────────────────────┐                       │
│         ▼                     ▼                     ▼                       │
│   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐              │
│   │  SWAP POOL    │    │   AUCTION     │    │ GAMIFICATION  │              │
│   │               │    │   REGISTRY    │    │    STATE      │              │
│   │ • wFDUSD pool │    │               │    │               │              │
│   │ • Buy/sell    │    │ • List auction│    │ • Achievements│              │
│   │ • Fee calc    │    │ • Place bid   │    │ • Streaks     │              │
│   │ • Rate query  │    │ • Finalize    │    │ • Leaderboards│              │
│   └───────┬───────┘    └───────┬───────┘    └───────┬───────┘              │
│           │                    │                    │                       │
│           │                    │                    │                       │
│           ▼                    ▼                    ▼                       │
│   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐              │
│   │  ORACLE HUB   │    │  AUCTION      │    │  PRIZE POOL   │              │
│   │               │    │  (per-auction)│    │               │              │
│   │ • Price feeds │    │               │    │ • Weekly pot  │              │
│   │ • Validation  │    │ • Bid history │    │ • Monthly pot │              │
│   │ • Staleness   │    │ • Asset escrow│    │ • Draw logic  │              │
│   └───────────────┘    │ • Settlement  │    │ • Claim       │              │
│                        └───────────────┘    └───────────────┘              │
│                                                                              │
│   EXISTING (Not Modified):                                                   │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  CMM TREASURY  │  CMM GOVERNANCE  │  USTR TOKEN  │  UST1 TOKEN       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 State Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KEY STATE STRUCTURES                                 │
│                                                                              │
│   SWAP POOL STATE:                                                           │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  pool_balance: Uint128           // Available wFDUSD liquidity      │   │
│   │  total_swapped_in: Uint128       // Cumulative buy volume           │   │
│   │  total_swapped_out: Uint128      // Cumulative sell volume          │   │
│   │  fees_collected: Uint128         // Total fees earned               │   │
│   │  last_oracle_update: Timestamp   // Latest price update             │   │
│   │  is_paused: bool                 // Emergency pause flag            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   AUCTION STATE (per auction):                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  auction_id: u64                 // Unique identifier               │   │
│   │  seller: Addr                    // Asset owner                     │   │
│   │  asset: Asset                    // CW20 or CW721 details           │   │
│   │  reserve_price: Uint128          // Minimum acceptable bid          │   │
│   │  current_bid: Uint128            // Highest bid amount              │   │
│   │  current_bidder: Option<Addr>    // Highest bidder                  │   │
│   │  bid_count: u32                  // Total bids placed               │   │
│   │  start_time: Timestamp           // Auction start                   │   │
│   │  end_time: Timestamp             // Auction end (may extend)        │   │
│   │  extensions_used: u8             // Anti-snipe extensions           │   │
│   │  status: AuctionStatus           // Listing/Active/Ended/Finalized  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   USER GAMIFICATION STATE:                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  total_wins: u64                 // Lifetime auction wins           │   │
│   │  current_streak: u32             // Active win streak               │   │
│   │  best_streak: u32                // All-time best streak            │   │
│   │  total_volume: Uint128           // Cumulative winning bids         │   │
│   │  achievements: Vec<AchievementId>// Earned achievements             │   │
│   │  weekly_entries: u32             // Current week prize entries      │   │
│   │  fee_discount_bps: u16           // Active fee discount             │   │
│   │  discount_expires: Timestamp     // When discount ends              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Message Interfaces

#### Swap Messages

| Message | Parameters | Description |
|---------|------------|-------------|
| `SwapIn` | `amount`, `min_receive` | Buy wFDUSD with USTC/UST1 |
| `SwapOut` | `amount`, `min_receive` | Sell wFDUSD for USTC/UST1 |
| `QueryRate` | `direction`, `amount` | Get current exchange rate |
| `QueryPool` | - | Get pool state and liquidity |

#### Auction Messages

| Message | Parameters | Description |
|---------|------------|-------------|
| `CreateAuction` | `asset`, `reserve`, `duration`, `start_time` | List new auction |
| `PlaceBid` | `auction_id`, `amount` | Submit bid |
| `CancelAuction` | `auction_id` | Cancel (if no bids yet) |
| `FinalizeAuction` | `auction_id` | Complete auction, distribute |
| `ClaimRefund` | `auction_id` | Claim outbid refund |
| `QueryAuction` | `auction_id` | Get auction details |
| `QueryActiveAuctions` | `limit`, `start_after` | List active auctions |

#### Gamification Messages

| Message | Parameters | Description |
|---------|------------|-------------|
| `ClaimAchievement` | `achievement_id` | Mint achievement NFT |
| `QueryProfile` | `address` | Get user gamification stats |
| `QueryLeaderboard` | `board_type`, `limit` | Get leaderboard rankings |
| `ClaimPrize` | `draw_id` | Claim won prize |
| `QueryPrizePools` | - | Get current pool amounts |

---

## 7. Static Frontend Architecture

### 7.1 Design Principles

The frontend is designed to operate without any backend services, querying TerraClassic directly.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATIC FRONTEND ARCHITECTURE                         │
│                                                                              │
│   HOSTING:                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Primary: IPFS (pinned via Pinata/Fleek)                            │   │
│   │  Mirror: Arweave (permanent storage)                                │   │
│   │  DNS: ENS/Handshake for decentralized domain                        │   │
│   │  CDN: Cloudflare (optional, for performance)                        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   DATA FETCHING:                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • Direct LCD/RPC queries to TerraClassic nodes                     │   │
│   │  • Contract state queries via CosmWasm                              │   │
│   │  • No backend caching layer                                         │   │
│   │  • Client-side state management (React Query/SWR)                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   WALLET INTEGRATION:                                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • Terra Station (primary)                                          │   │
│   │  • Keplr (Cosmos ecosystem)                                         │   │
│   │  • Leap Wallet                                                      │   │
│   │  • WalletConnect (mobile)                                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 UI Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UI COMPONENT STRUCTURE                               │
│                                                                              │
│   SWAP PAGE:                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │  SWAP CARD                                                   │    │   │
│   │  │  • Token selector (USTC/UST1 ↔ wFDUSD)                      │    │   │
│   │  │  • Amount input with max button                              │    │   │
│   │  │  • Exchange rate display                                     │    │   │
│   │  │  • Fee breakdown                                             │    │   │
│   │  │  • Slippage settings                                         │    │   │
│   │  │  • Execute swap button                                       │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │  POOL INFO                                                   │    │   │
│   │  │  • Available liquidity                                       │    │   │
│   │  │  • 24h volume                                                │    │   │
│   │  │  • Current oracle price                                      │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   AUCTION GALLERY:                                                           │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │  FILTER BAR                                                  │    │   │
│   │  │  • Status: Active / Ending Soon / Completed                  │    │   │
│   │  │  • Asset Type: CW20 / NFT / Bundle                          │    │   │
│   │  │  • Price Range slider                                        │    │   │
│   │  │  • Sort: Ending / Price / Bids                              │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │  AUCTION GRID (Cards)                                        │    │   │
│   │  │  • Asset preview image/icon                                  │    │   │
│   │  │  • Current bid / Reserve price                               │    │   │
│   │  │  • Time remaining (countdown)                                │    │   │
│   │  │  • Number of bids                                            │    │   │
│   │  │  • Quick bid button                                          │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   AUCTION DETAIL PAGE:                                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  ┌──────────────────────┐  ┌────────────────────────────────────┐   │   │
│   │  │  ASSET DISPLAY       │  │  BID PANEL                         │   │   │
│   │  │  • Large image/icon  │  │  • Current bid (highlighted)       │   │   │
│   │  │  • Asset metadata    │  │  • Bid input + min increment       │   │   │
│   │  │  • Seller info       │  │  • Place bid button                │   │   │
│   │  │                      │  │  • Countdown timer                 │   │   │
│   │  └──────────────────────┘  └────────────────────────────────────┘   │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │  BID HISTORY (scrollable)                                    │    │   │
│   │  │  • Bidder address (truncated)                               │    │   │
│   │  │  • Bid amount                                                │    │   │
│   │  │  • Timestamp                                                 │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   PROFILE & ACHIEVEMENTS:                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  ┌──────────────────────┐  ┌────────────────────────────────────┐   │   │
│   │  │  STATS SUMMARY       │  │  ACHIEVEMENT GRID                  │   │   │
│   │  │  • Total wins        │  │  • Earned badges (highlighted)     │   │   │
│   │  │  • Current streak    │  │  • Locked badges (greyed)          │   │   │
│   │  │  • Best streak       │  │  • Progress indicators             │   │   │
│   │  │  • Total volume      │  │  • Claim buttons                   │   │   │
│   │  │  • Active discount   │  │                                    │   │   │
│   │  └──────────────────────┘  └────────────────────────────────────┘   │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │  AUCTION HISTORY (My Bids / My Auctions)                    │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   LEADERBOARD:                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • Tab selector (Volume / Wins / Streak / Sellers)               │   │
│   │  • Ranked list with rank, address, stat, trend indicator        │   │
│   │  • "Your Position" sticky card                                   │   │
│   │  • Prize pool display (current week/month amounts)               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | React 18+ / Vite | Fast builds, modern React features |
| Styling | TailwindCSS | Utility-first, consistent design |
| State | React Query | Server state caching, auto-refresh |
| Wallet | CosmJS + Terra.js | Native Cosmos/Terra integration |
| Build | Static export | No server required |
| Hosting | IPFS + Arweave | Censorship resistant |

---

## 8. Governance Integration

### 8.1 Governance Scope

All system parameters are controlled through the existing CMM Governance framework:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GOVERNANCE-CONTROLLED PARAMETERS                     │
│                                                                              │
│   SWAP PARAMETERS:                                                           │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • buy_fee_bps / sell_fee_bps (fee rates)                          │   │
│   │  • oracle_staleness_threshold                                       │   │
│   │  • max_slippage_bps                                                 │   │
│   │  • daily_swap_limit                                                 │   │
│   │  • pause_swaps (emergency)                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   AUCTION PARAMETERS:                                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • min/max duration                                                 │   │
│   │  • min_bid_increment_bps                                            │   │
│   │  • anti_snipe_window / extension / max_extensions                  │   │
│   │  • seller_fee_bps / buyer_fee_bps                                  │   │
│   │  • pause_auctions (emergency)                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   GAMIFICATION PARAMETERS:                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • Achievement thresholds                                           │   │
│   │  • Streak bonus rates                                               │   │
│   │  • Prize pool allocation percentages                               │   │
│   │  • Draw timing                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   BRIDGE PARAMETERS:                                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • Daily bridge limits                                              │   │
│   │  • Oracle node whitelist                                            │   │
│   │  • Circuit breaker thresholds                                       │   │
│   │  • Timelock durations                                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Governance Actions

| Action Type | Timelock | Quorum | Description |
|-------------|----------|--------|-------------|
| Parameter Update | 3 days | 10% | Modify configurable parameters |
| Emergency Pause | Immediate | 3-of-5 multisig | Halt system in emergency |
| Contract Migration | 7 days | 25% | Upgrade contract logic |
| Bridge Node Update | 5 days | 15% | Modify oracle node set |
| Treasury Withdrawal | 7 days | 30% | Move funds from treasury |

---

## 9. Security Considerations

### 9.1 Smart Contract Security

| Risk | Mitigation |
|------|------------|
| **Reentrancy** | CEI pattern, reentrancy guards on all external calls |
| **Integer Overflow** | Rust's checked arithmetic, explicit overflow handling |
| **Oracle Manipulation** | Multi-source aggregation, staleness checks, circuit breakers |
| **Front-running** | Anti-snipe extension, commit-reveal for large bids (optional) |
| **Access Control** | Role-based permissions, governance timelock |
| **Upgrade Risk** | Immutable core logic, governance-only migration |

### 9.2 Bridge Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BRIDGE SECURITY LAYERS                               │
│                                                                              │
│   LAYER 1: MULTISIG CONTROL                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • 3-of-5 multisig on BSC escrow                                    │   │
│   │  • Geographic distribution of key holders                           │   │
│   │  • Hardware wallet requirement                                      │   │
│   │  • Regular key rotation schedule                                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   LAYER 2: RATE LIMITING                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • Daily bridge cap: 500,000 wFDUSD                                 │   │
│   │  • Per-transaction limit: 50,000 wFDUSD                             │   │
│   │  • Cooldown between large transactions                              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   LAYER 3: TIMELOCK                                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • Transactions > 100,000 wFDUSD: 24-hour delay                    │   │
│   │  • Parameter changes: 72-hour delay                                 │   │
│   │  • Emergency unlock: Governance vote required                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   LAYER 4: CIRCUIT BREAKER                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • Auto-pause on: Daily limit exceeded                              │   │
│   │  • Auto-pause on: Unusual bridge pattern detected                   │   │
│   │  • Auto-pause on: Oracle deviation > 2%                            │   │
│   │  • Resume requires multisig action                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Auction Security

| Risk | Mitigation |
|------|------------|
| **Bid Sniping** | Anti-snipe extension mechanism |
| **Fake Bids** | Funds escrowed on bid placement |
| **Seller Manipulation** | Cannot cancel after first bid |
| **Asset Frontrunning** | Asset locked in contract on listing |
| **Price Manipulation** | No oracle dependency for auctions |

### 9.4 Audit Requirements

| Phase | Audit Scope | Auditor Tier |
|-------|-------------|--------------|
| Pre-Testnet | Swap contracts, oracle integration | 1 mid-tier audit |
| Pre-Mainnet | Full system, bridge contracts | 2 audits (1 top-tier) |
| Post-Launch | Gamification, prize distribution | 1 specialized audit |

---

## 10. Risk Analysis

### 10.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Oracle failure | Low | High | Fallback to $1.00, auto-pause |
| Bridge exploit | Low | Critical | Rate limits, multisig, insurance |
| Smart contract bug | Medium | High | Audits, bug bounty, gradual rollout |
| Frontend unavailability | Low | Medium | Multiple hosting mirrors |
| Chain congestion | Medium | Low | Gas optimization, priority fees |

### 10.2 Economic Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| FDUSD depeg | Very Low | High | Circuit breaker at ±2% |
| Low auction volume | Medium | Medium | Gamification incentives |
| Prize pool drain | Low | Low | Sustainable allocation percentages |
| Venus protocol failure | Very Low | High | Monitor Venus health, diversify |

### 10.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Key compromise | Low | Critical | Multisig, hardware wallets |
| Oracle node failure | Medium | Medium | Redundant node set (5+) |
| Governance attack | Low | High | Quorum requirements, timelock |

---

## 11. Implementation Phases & Timeline

### 11.1 Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION ROADMAP                               │
│                                                                              │
│   PHASE 1: FOUNDATION                                                        │
│   Duration: 6 weeks                                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Week 1-2: Core Contract Development                                │   │
│   │  • CMM Controller scaffold                                          │   │
│   │  • Swap Pool contract                                               │   │
│   │  • Basic state management                                           │   │
│   │                                                                      │   │
│   │  Week 3-4: Oracle Integration                                       │   │
│   │  • Oracle Hub contract                                              │   │
│   │  • CL8Y node attestation protocol                                   │   │
│   │  • Price aggregation logic                                          │   │
│   │  • Staleness and validation                                         │   │
│   │                                                                      │   │
│   │  Week 5-6: Testing & Integration                                    │   │
│   │  • Unit tests (>90% coverage)                                       │   │
│   │  • Integration tests                                                │   │
│   │  • Testnet deployment (rebel-2)                                     │   │
│   │  • Treasury integration testing                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   PHASE 2: AUCTION SYSTEM                                                    │
│   Duration: 5 weeks                                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Week 7-8: Auction Contracts                                        │   │
│   │  • Auction Registry contract                                        │   │
│   │  • Individual auction instances                                     │   │
│   │  • Bid escrow and refund logic                                     │   │
│   │  • Anti-snipe mechanism                                             │   │
│   │                                                                      │   │
│   │  Week 9-10: Auction Features                                        │   │
│   │  • Bundle auctions                                                  │   │
│   │  • Treasury auctions                                                │   │
│   │  • Settlement and distribution                                      │   │
│   │  • Event emission for indexing                                      │   │
│   │                                                                      │   │
│   │  Week 11: Integration Testing                                       │   │
│   │  • End-to-end auction flow tests                                   │   │
│   │  • Edge case testing                                                │   │
│   │  • Testnet auction trials                                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   PHASE 3: GAMIFICATION                                                      │
│   Duration: 4 weeks                                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Week 12-13: Achievement System                                     │   │
│   │  • Gamification State contract                                      │   │
│   │  • Achievement tracking logic                                       │   │
│   │  • Streak calculation                                               │   │
│   │  • Achievement NFT minting                                          │   │
│   │                                                                      │   │
│   │  Week 14-15: Prize System                                           │   │
│   │  • Prize Pool contract                                              │   │
│   │  • Weekly/monthly draw logic                                       │   │
│   │  • Verifiable randomness implementation                            │   │
│   │  • Prize claiming mechanism                                         │   │
│   │  • Leaderboard queries                                              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   PHASE 4: BRIDGE INFRASTRUCTURE                                             │
│   Duration: 5 weeks                                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Week 16-17: BSC Contracts                                          │   │
│   │  • Bridge Escrow contract (BSC)                                     │   │
│   │  • Venus integration (vFDUSD staking)                              │   │
│   │  • Lock/unlock mechanics                                            │   │
│   │                                                                      │   │
│   │  Week 18-19: Cross-Chain Coordination                               │   │
│   │  • CL8Y node bridge attestation                                    │   │
│   │  • wFDUSD minting on Terra                                          │   │
│   │  • Rate limiting and circuit breakers                              │   │
│   │                                                                      │   │
│   │  Week 20: Bridge Testing                                            │   │
│   │  • BSC testnet deployment                                           │   │
│   │  • Cross-chain flow testing                                         │   │
│   │  • Security review                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   PHASE 5: FRONTEND & DEPLOYMENT                                             │
│   Duration: 4 weeks                                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Week 21-22: Frontend Development                                   │   │
│   │  • Swap UI                                                          │   │
│   │  • Auction gallery and detail pages                                │   │
│   │  • Profile and achievements                                         │   │
│   │  • Leaderboard                                                      │   │
│   │  • Wallet integration                                               │   │
│   │                                                                      │   │
│   │  Week 23: Testing & Optimization                                    │   │
│   │  • UI/UX testing                                                    │   │
│   │  • Performance optimization                                         │   │
│   │  • Mobile responsiveness                                            │   │
│   │  • IPFS deployment testing                                          │   │
│   │                                                                      │   │
│   │  Week 24: Mainnet Preparation                                       │   │
│   │  • Final audit remediation                                          │   │
│   │  • Governance proposal submission                                   │   │
│   │  • Documentation finalization                                       │   │
│   │  • Community testing period                                         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   PHASE 6: LAUNCH & MONITORING                                               │
│   Duration: 4 weeks                                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Week 25: Mainnet Deployment                                        │   │
│   │  • Contract deployment (columbus-5)                                 │   │
│   │  • Governance execution                                             │   │
│   │  • Frontend go-live                                                 │   │
│   │  • Initial liquidity seeding                                        │   │
│   │                                                                      │   │
│   │  Week 26-28: Monitoring & Iteration                                 │   │
│   │  • 24/7 monitoring                                                  │   │
│   │  • Bug bounty program active                                        │   │
│   │  • Community feedback collection                                    │   │
│   │  • Parameter tuning via governance                                  │   │
│   │  • First weekly prize draw                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Timeline Summary

| Phase | Duration | Cumulative | Key Deliverables |
|-------|----------|------------|------------------|
| Phase 1: Foundation | 6 weeks | 6 weeks | Swap contracts, oracle, testnet |
| Phase 2: Auctions | 5 weeks | 11 weeks | Full auction system |
| Phase 3: Gamification | 4 weeks | 15 weeks | Achievements, prizes, leaderboards |
| Phase 4: Bridge | 5 weeks | 20 weeks | BSC integration, cross-chain |
| Phase 5: Frontend | 4 weeks | 24 weeks | Complete UI, IPFS deployment |
| Phase 6: Launch | 4 weeks | 28 weeks | Mainnet live, monitoring |

**Total Development Time: ~28 weeks (7 months)**

### 11.3 Milestone Gates

| Milestone | Gate Criteria | Phase End |
|-----------|---------------|-----------|
| M1: Swap Ready | Swap tests pass, testnet deployed | Phase 1 |
| M2: Auction Ready | Auction flow complete, testnet trials | Phase 2 |
| M3: Gamification Ready | Full gamification on testnet | Phase 3 |
| M4: Bridge Ready | Cross-chain flow tested | Phase 4 |
| M5: Audit Complete | All critical findings remediated | Phase 5 |
| M6: Mainnet Launch | Governance approval, deployment | Phase 6 |

### 11.4 Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE DEPENDENCIES                                   │
│                                                                              │
│   Phase 1 ────────► Phase 2 ────────► Phase 3                               │
│   (Swap)            (Auction)         (Gamification)                        │
│      │                                     │                                 │
│      │                                     │                                 │
│      └──────────────► Phase 4 ◄────────────┘                                │
│                       (Bridge)                                               │
│                          │                                                   │
│                          ▼                                                   │
│                       Phase 5                                                │
│                      (Frontend)                                              │
│                          │                                                   │
│                          ▼                                                   │
│                       Phase 6                                                │
│                       (Launch)                                               │
│                                                                              │
│   CRITICAL PATH: Phase 1 → Phase 4 → Phase 5 → Phase 6                     │
│   PARALLEL WORK: Phase 2 & 3 can proceed while Phase 4 develops            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **wFDUSD** | Wrapped FDUSD - CW20 representation of FDUSD on TerraClassic |
| **vFDUSD** | Venus FDUSD - FDUSD staked in Venus Protocol on BSC |
| **English Auction** | Ascending price auction where highest bidder wins |
| **Anti-Snipe** | Mechanism extending auction time on late bids |
| **Circuit Breaker** | Automatic system pause triggered by anomalies |
| **CL8Y Node** | Governance and oracle node for CMM ecosystem |

## Appendix B: References

- [Venus Protocol Documentation](https://docs.venus.io/)
- [FDUSD Official Site](https://firstdigitallabs.com/)
- [CosmWasm Smart Contracts](https://docs.cosmwasm.com/)
- [TerraClassic Documentation](https://terra-classic.io/docs)

---

> **Document Version**: 1.0  
> **Last Updated**: January 2026  
> **Status**: Draft Proposal  
> **Author**: CMM Development Team
