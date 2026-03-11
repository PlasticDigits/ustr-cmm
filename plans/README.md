# USTR CMM Plans

This folder contains the architectural proposals and design documents for the USTR CMM ecosystem. Each plan details a specific component or feature of the system.

## Plans

### [PROPOSAL.md](./PROPOSAL.md)

The core proposal for the USTR CMM collateralized unstablecoin system, introducing USTR as a repeg token and UST1 as an over-collateralized unstablecoin. It details the treasury contract, USTC-to-USTR swap mechanism with time-decaying rates, referral system, and CR tier-based minting/redemption. This foundational document covers the economic model, smart contract specifications, governance structure, and phased development roadmap.

### [DEX_PLAN.md](./DEX_PLAN.md)

A next-generation DEX proposal featuring v2 (constant product AMM) and v3 (concentrated liquidity) pools with an omnirouter for optimal trade execution. The unique fee structure burns a flat UST1 amount per trade and applies a 2.99% exit fee on trading wallet withdrawals, maximizing UST1 burn rather than distributing fees to LPs. It includes an advanced trading wallet system with tiered discounts based on cumulative UST1 burns.

### [DEX_PERP_PLAN.md](./DEX_PERP_PLAN.md)

A perpetual futures DEX design with robust defenses against toxic order flow, including batch auctions, commit-reveal ordering, and dynamic spreads. The system features Auto-Deleveraging (ADL) for solvency protection, an insurance fund for liquidation shortfalls, and uses UST1 exclusively as the settlement and collateral currency. It supports CW20 tokens only and integrates with the spot DEX tier system for unified fee discounts.

### [CMM_AUCTION_PLAN.md](./CMM_AUCTION_PLAN.md)

A marketplace proposal for TerraClassic featuring cross-chain FDUSD swaps using Venus-staked FDUSD from BNB Smart Chain and gamified English auctions for assets without oracle pricing. The FDUSD swap system implements symmetric 3.5% fees with governance-controlled parameters, while auctions include anti-snipe mechanisms, achievement systems, and prize pools. The fully on-chain design leverages the existing CMM Treasury and Governance infrastructure.

### [MONEYMARKET_PLAN.md](./MONEYMARKET_PLAN.md)

An oracle-free lending protocol inspired by Ajna but enhanced with smart bucket aggregation, risk tier abstractions, and adaptive liquidation auctions. It enables permissionless pool creation for any token pair with UST1 as the primary quote asset, using lender-specified price buckets for trustless price discovery. The design includes a composable vault layer for yield strategies and integrates with the USTR CMM ecosystem for fee distribution.

### [GAMEFI_PLAN.md](./GAMEFI_PLAN.md)

PROTOCASS is a skill-based text RPG platform using a Web 2.5 architecture with ImmuneDB for verifiable game state and CosmWasm contracts for UST1 vault operations. All gameplay is deterministic with zero randomness, prioritizing exploration, asset acquisition, and pattern-based combat while burning UST1 as the primary economic mechanism. The system supports LLM-generated content, creator-built worlds with revenue sharing, and NFT-based asset ownership.
