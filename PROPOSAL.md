# USTR CMM — Collateralized Unstablecoin System Proposal

> **Version**: 1.0  
> **Date**: December 2024  
> **Status**: Draft  
> **Networks**: TerraClassic Mainnet (columbus-5), TerraClassic Testnet (rebel-2)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Background & Motivation](#background--motivation)
3. [System Architecture](#system-architecture)
4. [Token Specifications](#token-specifications)
5. [Smart Contract Specifications](#smart-contract-specifications)
   - [Treasury Contract](#treasury-contract)
   - [USTC-to-USTR Swap Contract](#ustc-to-ustr-swap-contract)
6. [Economic Model](#economic-model)
7. [Security Considerations](#security-considerations)
8. [Governance & Upgrade Path](#governance--upgrade-path)
9. [Frontend Application](#frontend-application)
10. [Project Structure](#project-structure)
11. [Development Phases](#development-phases)
12. [Testing Strategy](#testing-strategy)
13. [Deployment Plan](#deployment-plan)
14. [Risk Analysis](#risk-analysis)
15. [Future Roadmap](#future-roadmap)
16. [Appendices](#appendix-a-contract-interface-summaries)
    - [Appendix A: Contract Interface Summaries](#appendix-a-contract-interface-summaries)
    - [Appendix B: Economic Calculations](#appendix-b-economic-calculations)

> **📚 Economic Theory & Bibliography**: For comprehensive economic theory, design rationale, comparisons with other stablecoin systems, and academic references, see [docs/ECONOMICS.md](./docs/ECONOMICS.md).
>
> **📖 Official Documentation**: For TerraClassic network documentation, see [terra-classic.io/docs](https://terra-classic.io/docs).

---

## Executive Summary

USTR CMM is a collateralized monetary system designed for TerraClassic that introduces two primary tokens:

- **USTR**: A repeg token acquired through USTC deposits, providing early supporters exposure to the ecosystem's growth
- **UST1**: A future collateralized **unstablecoin** backed by USTC and a diversified basket of crypto assets—including on-chain real-world assets (RWAs) and synthetic assets—with dynamic minting based on collateralization ratios

### Unstablecoin vs Stablecoin

UST1 is an **unstablecoin**, which differs fundamentally from traditional stablecoins:

| Aspect | Stablecoin | Unstablecoin (UST1) |
|--------|------------|---------------------|
| **Design Goal** | Track $1 exactly | Serve as accounting mechanism with $1 target |
| **Price Behavior** | Pegged, deviations are failures | Market-determined, gravitates toward target over time |
| **Collateral Type** | Stable assets (US Treasuries, USD) | Can include volatile crypto assets |
| **Risk Profile** | Vulnerable to "death spirals" if peg breaks | Flexible; can track up/down with market conditions |
| **Bank Run Risk** | High if confidence lost | Low; no forced peg means no panic redemptions |

Because unstablecoins are not designed to rigidly track $1, they can safely absorb volatility in their backing collateral without triggering cascading liquidations or death spirals analogous to bank runs.

This proposal outlines the architecture, economics, and implementation plan for Phase 1 of the system, which focuses on:

1. Deploying USTR as a CW20 mintable token
2. Establishing a secure treasury contract to hold protocol assets
3. Honoring preregistration deposits (a substantial amount of USTC → USTR at 1:1 ratio)
4. Implementing a one-way USTC→USTR public swap with a time-decaying exchange rate

The system is designed with a clear separation of concerns, emphasizing security, transparency, and a path toward decentralized governance. Note: Neither USTR nor UST1 is the governance token; governance will be added in a future phase, backed by CL8Y nodes.

### CL8Y and Governance Nodes

**CL8Y** ([CL8Y.com](https://cl8y.com)) is the community memecoin supporting developers behind the USTR CMM project. **CL8Y nodes** are a proposed NFT-based governance system designed for:

- **Cross-chain bridging**: Facilitating asset transfers between chains
- **CMM governance**: Providing voting power and decision-making authority for protocol parameters

The NFT-based governance model ensures that governance rights are non-fungible and tied to specific node holders, creating a more robust and less speculative governance mechanism compared to purely token-based systems.

---

## Background & Motivation

### The TerraClassic Opportunity

Following the Terra ecosystem events, the TerraClassic community has continued to develop and maintain the network. USTC, the original algorithmic stablecoin, remains in circulation but has lost its peg. This presents an opportunity to:

1. **Absorb USTC supply**: Create a productive use for existing USTC holdings
2. **Build new infrastructure**: Establish a collateralized unstablecoin system with proper backing
3. **Community alignment**: Reward early supporters through the USTR distribution mechanism

### Current Asset Position

The protocol begins with a **substantial amount of USTC** already deposited via the preregistration smart contract on TerraClassic ([cmm-ustc-preregister](https://github.com/PlasticDigits/cmm-ustc-preregister), [smart contract source](https://github.com/PlasticDigits/cmm-ustc-preregister/tree/main/smartcontracts-terraclassic)). The preregistration contract remains open and users are continuing to deposit, so the final amount will be determined at the time of migration. These preregistration depositors will receive **1 USTR for each 1 USTC** they contributed at the 1:1 ratio.

The preregistration contract (currently live on mainnet) allows the admin to transfer the deposited USTC to a designated receiver address after a 7-day timelock. The admin will set the treasury contract address as the receiver, wait 7 days, then execute the transfer as a standard CW20 transfer.

This initial USTC is transferred directly to the treasury as collateral backing. Since UST1 supply is zero at launch, the collateralization ratio (CR) will be infinite, which is expected and places the system in the "BLUE" tier from day one.

Note: A small amount of deposits exist on BSC; these depositors will receive USTR-cb on BSC (not USTR on TerraClassic). BSC handling is outside the scope of this proposal, which focuses solely on TerraClassic.

### Why an Unstablecoin?

Unlike USTC's original algorithmic design (which attempted to maintain a rigid peg), UST1 is an unstablecoin with collateral backing that guides price toward $1 over time. This approach:

- **Avoids death spirals**: No forced peg means no panic-driven bank runs
- **Supports volatile collateral**: Can safely hold crypto assets without existential risk
- **Provides verifiable backing**: Transparent on-chain collateralization ratios
- **Enables gradual price convergence**: Market forces + CR tiers push price toward $1 target
- **Maintains flexibility**: Price can fluctuate with market conditions without system failure

> 📚 **Deep Dive**: For comprehensive economic theory, including why algorithmic stablecoins fail, how the CMM approach works, comparisons with DAI/Frax/LUSD, and the full academic bibliography, see [docs/ECONOMICS.md](./docs/ECONOMICS.md).

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            USTR CMM SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────┐                                     ┌─────────────────┐ │
│   │    Users      │                                     │   Governance    │ │
│   │               │                                     │   (Admin EOA)   │ │
│   └───────┬───────┘                                     └────────┬────────┘ │
│           │                                                      │          │
│           │ USTC (MsgExecuteContract)                            │          │
│           │ [NO TAX - direct to contract]                        │          │
│           ▼                                                      ▼          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        TREASURY CONTRACT                            │   │
│   │  - Accepts USTC via SwapDeposit (tax-free)                          │   │
│   │  - Notifies Swap contract of deposits                               │   │
│   │  - 7-day timelock on governance changes + withdrawals               │   │
│   └────────────────────────────┬────────────────────────────────────────┘   │
│                                │ NotifyDeposit                              │
│                                ▼                                            │
│   ┌───────────────┐     ┌───────────────┐                                   │
│   │  USTR Token   │◄────│  Swap         │  Tracks deposits, calculates     │
│   │  (CW20)       │Mint │  Contract     │  rate, mints USTR to users       │
│   └───────────────┘     │  [7-day       │                                   │
│                         │   timelock]   │                                   │
│                         └───────────────┘                                   │
│                                                                             │
│   ┌───────────────┐     [PHASE 2+]                                          │
│   │  UST1 Token   │     Collateralized unstablecoin                         │
│   │  (CW20)       │     CR-based minting/redemption                         │
│   └───────────────┘                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Tax Optimization**: Users send USTC to Treasury via `MsgExecuteContract` (SwapDeposit), which avoids TerraClassic's 0.5% burn tax. Treasury notifies Swap contract to mint USTR.

**Timelock Notes**:
- Treasury Contract: 7-day timelock applies to **governance address changes and withdrawals**
- Swap Contract: 7-day timelock applies to **admin address changes only**
- All treasury withdrawals require a 7-day waiting period before execution

### Contract Relationships

1. **USTR Token Contract**: Standard CW20 with mintable extension; the Swap Contract and admin are authorized as minters
2. **Treasury Contract**: Holds all protocol assets (USTC, future basket tokens); accepts swap deposits (tax-free) and notifies Swap contract; controlled by governance with 7-day timelock on governance changes
3. **Swap Contract**: Receives deposit notifications from Treasury, calculates exchange rate, mints USTR to users; includes 7-day timelock on admin changes
4. **Airdrop Contract**: Enables batch distribution of CW20 tokens to multiple recipients in a single transaction (similar to [disperse.app](https://disperse.app))
5. **Preregistration Migration**: Admin airdrops 16.7M USTR to preregistration participants at 1:1 ratio for their deposited USTC
6. **UST1 Token Contract** (Phase 2): CW20 with mintable extension; will be minted based on collateralization ratio tiers

**Tax-Optimized Swap Flow**: Users send USTC to Treasury (not Swap contract) via `SwapDeposit {}` message. This uses `MsgExecuteContract` which avoids TerraClassic's 0.5% burn tax. Treasury notifies Swap contract, which mints USTR to the user.

**USTR Minter Ownership**: The admin initially has authority to add/remove minters on the USTR token. This permission can be transferred to governance in a future phase. The minter list is not frozen and can be modified by the admin until governance transition.

**Single Admin/Governance**: The same address controls both the swap contract (admin) and treasury contract (governance). This simplifies operations while the 7-day timelocks on address changes provide security.

---

## Token Specifications

### USTR Token

| Property | Value |
|----------|-------|
| **Name** | USTR |
| **Symbol** | USTR |
| **Decimals** | 18 |
| **Type** | Repeg token (not governance) |
| **Standard** | CW20 Mintable (based on [PlasticDigits/cw20-mintable](https://github.com/PlasticDigits/cw20-mintable)) |
| **Initial Supply** | Substantial (minted 1:1 for preregistration participants) |
| **Max Supply** | Uncapped (additional supply via public swap) |
| **Minters** | Admin (for preregistration), Swap Contract (for public swap) |

**Note on Decimals**: CW20 Mintable tokens use 18 decimals. The CMM system is compatible with any decimal count—including the native `uusd` 6 decimal format—and automatically handles decimal conversions using each token's on-chain decimal configuration.

**Key Characteristics**:
- **Preregistration participants** receive 1 USTR for each 1 USTC deposited (1:1 ratio)
- **Public swap participants** receive USTR at time-decaying rates that increase from 1.5 to 2.5 USTC per USTR over 100 days:
  - The rate starts at 1.5 USTC per USTR at public swap launch
  - The rate linearly increases to 2.5 USTC per USTR by day 100
  - This creates a **Schelling point attractor** that encourages early adoption—participants who swap early pay significantly less than late participants
  - The increasing cost creates urgency and rewards conviction in the project
- Standard CW20 functionality: transfers, allowances, burn
- Future utility: staking pools, LP provision, buy-and-burn mechanism (Phase 2+)

### UST1 Token (Phase 2)

| Property | Value |
|----------|-------|
| **Name** | UST1 Unstablecoin |
| **Symbol** | UST1 |
| **Decimals** | 18 |
| **Type** | Collateralized unstablecoin (not governance) |
| **Standard** | CW20 Mintable |
| **Price Target** | $1 (not a peg; market-determined with collateral backing) |
| **Initial Supply** | 0 (CR is infinite at launch) |
| **Collateralization** | Over-collateralized basket (USTC + auction-acquired volatile assets, including on-chain RWAs and synthetic assets) |

**Collateralization Ratio (CR) Tiers**:

The CR tier system creates market incentives that guide UST1 price toward the $1 target without forcing a rigid peg:

| Tier | CR Range | Behavior | Price Effect |
|------|----------|----------|--------------|
| 🔴 **RED** | < 95% | System locked; no minting or redemption | Reduces supply pressure |
| 🟡 **YELLOW** | 95% – 110% | Auctions enabled solely to buy collateral | Increases backing |
| 🟢 **GREEN** | 110% – 190% | Auctions additionally enabled to buy UST1 for collateral (redemption) | Creates buy pressure toward $1 |
| 🔵 **BLUE** | > 190% | UST1 mints enabled for 5-year rolling distribution pools | Controlled supply expansion |

This mechanism allows UST1 to fluctuate with market conditions while collateral-backed incentives continuously guide it toward the $1 target—without the rigid peg that caused USTC's death spiral.

**BLUE Tier Distribution** (when CR > 190%):

UST1 is minted at a rate of `(collateral_above_190% / 5 years)` and distributed to three 5-year rolling pools:
1. **UST1 Staking Pool**: Rewards for UST1 stakers
2. **USTR Buy-and-Burn Pool**: Automatic market purchases and burns of USTR
3. **USTR Staking Pool**: Rewards for USTR stakers

**5-Year Rolling Pool Mechanics**:
- Each pool is a separate smart contract
- **Pool allocation**: Governance sets the distribution split among the three pools (adjustable)
- **Minting trigger**: Anyone can call a public method to mint the accrued UST1 (calculated per-second) to the pools
- **Distribution rate**: Each pool distributes its UST1 balance over 5 years (UST1 per second = balance / 5 years). This rate is **updated every time an action is taken** on the rolling pool:
  - For **staking pools**: The rate is recalculated on every deposit, withdraw, and claim action
  - For the **buy-back & burn pool**: The rate is recalculated on every BB&B trigger, which can be called by anyone at any time; a relayer script will execute this a minimum of once every 24 hours
- **CR drop handling**: If CR drops below 190%, pending distributions are **cancelled per-second**. The CR recalculation can be called at any time by anyone and **must always be called before UST1 mints** to the pools to ensure accurate distribution based on current collateralization
- **Staking pools**: Standard staking mechanics with per-second reward accrual, updated on deposit/withdraw/transfer
- **Buy-and-burn pool**: Anyone can trigger burns at any time; uses the same per-second UST1 tracking with 5-year division
- **Governance adjustability**: Governance creates auctions and sets basket targets, oracle configurations, future automated auction parameters, CR tier thresholds, distribution rates, and any other adjustable CMM parameters

**Auction Mechanism**:

The CMM uses English auctions (ascending price) with timer extensions to prevent sniping and incentivize active participation.

**Auction Creation** (Governance):
- Governance creates each auction, specifying:
  - The accepted collateral token(s)
  - Starting price / minimum acceptable collateral value
  - Fixed UST1 amount to be minted to the winner
- If no bids are placed before the timer expires, the auction is canceled

**Auction Parameters**:
- **Format**: English auction with governance-defined UST1 amount per auction
- **Participation**: No restrictions; anyone can participate
- **Minimum bid increment**: 1% higher than previous bid (in collateral value)
- **Timer**: Starts at 48 hours, adds 8 hours per new bid (capped at 48 hours maximum)

**Collateral Handling**:
- Bidders must transfer CW20 collateral to the auction contract when placing a bid
- On rebid: bidders can top up their existing collateral
- On superseded bid: bidders can withdraw their collateral
- On win: collateral is transferred to treasury in the same atomic transaction that mints UST1

**Bidding Incentives** (5% of auction UST1):

To encourage active participation, an additional 5% of the auction's UST1 is allocated as incentives. For example, a 100 UST1 auction has up to 5 UST1 of incentives.

| Recipient | Share | Criteria |
|-----------|-------|----------|
| Early Bidder | 50% | First bidder whose bid is within 10% of the final winning bid |
| 1st Most Frequent Bidder | 25% | Address with the most bids placed |
| 2nd Most Frequent Bidder | 10% | Second most bids placed |
| 3rd Most Frequent Bidder | 5% | Third most bids placed |
| 4th Most Frequent Bidder | 5% | Fourth most bids placed |
| 5th Most Frequent Bidder | 5% | Fifth most bids placed |

**Settlement Flow**:
1. Timer expires with no new bids
2. Winner's collateral is transferred to the treasury
3. UST1 is minted to the winner (auction amount)
4. UST1 incentives are minted to qualifying bidders
5. All operations occur in a single atomic transaction

**USTC Valuation for CR Calculations**: USTC is valued at the **lesser of the 7-day, 24-hour, and 1-hour weighted average** of the current market price. This conservative approach ensures the CR is calculated based on the most pessimistic recent valuation.

**Note**: Full oracle integration and asset valuation methodology will be detailed in Phase 2 specifications.

**Note**: At launch, with the preregistration USTC collateral and 0 UST1 supply, CR = ∞ (infinite), placing the system in the BLUE tier from day one.

---

## Smart Contract Specifications

### Treasury Contract

#### Purpose

The Treasury Contract serves as the secure custodian for all protocol assets. It holds USTC received from swaps and will eventually hold the diversified basket of assets backing UST1.

#### State

| Field | Type | Description |
|-------|------|-------------|
| `governance` | `Addr` | Current governance address (admin/DAO) |
| `pending_governance` | `Map<Addr, PendingGovernance>` | Mapping of proposed governance addresses to their proposals; multiple proposals can exist simultaneously |
| `timelock_duration` | `u64` | Duration of governance change delay (7 days = 604,800 seconds) |
| `cw20_whitelist` | `Map<Addr, bool>` | Map of CW20 addresses for balance tracking |
| `swap_contract` | `Option<Addr>` | Authorized swap contract for deposit notifications (set via `SetSwapContract`) |

```
PendingGovernance {
    new_address: Addr,
    execute_after: Timestamp,  // block time when change can be executed
}
```

**Note**: Multiple governance proposals can be pending simultaneously. When a proposal is accepted, all other pending proposals are automatically cleared since governance has changed.

#### Messages

**InstantiateMsg**
- `governance`: Initial governance address (deployer's admin wallet)

**ExecuteMsg**

| Message | Authority | Description |
|---------|-----------|-------------|
| `ProposeGovernanceTransfer { new_governance }` | Current governance | Initiates 7-day timelock for governance transfer; multiple proposals can exist simultaneously |
| `AcceptGovernanceTransfer {}` | Pending governance | Completes governance transfer after timelock; only clears the accepted proposal |
| `CancelGovernanceTransfer { proposed_governance }` | Current governance | Cancels a specific pending governance proposal |
| `ProposeWithdraw { destination, asset, amount }` | Governance | Proposes a withdrawal with 7-day timelock |
| `ExecuteWithdraw { withdrawal_id }` | Governance | Executes a pending withdrawal after timelock expires |
| `CancelWithdraw { withdrawal_id }` | Governance | Cancels a specific pending withdrawal |
| `AddCw20 { contract_addr }` | Governance | Adds a CW20 token to the balance tracking whitelist |
| `RemoveCw20 { contract_addr }` | Governance | Removes a CW20 token from the whitelist |
| `SetSwapContract { contract_addr }` | Governance | Sets the authorized swap contract address for deposit notifications |
| `SwapDeposit {}` | Any user | Accepts USTC for swap (minimum 1 USTC); notifies swap contract to mint USTR to sender |
| `Receive(Cw20ReceiveMsg)` | CW20 contract | CW20 receive hook; accepts direct CW20 token transfers |

**QueryMsg**

| Query | Response | Description |
|-------|----------|-------------|
| `Config {}` | `ConfigResponse` | Returns current governance and timelock settings |
| `PendingGovernance {}` | `PendingGovernanceResponse` | Returns all pending governance proposals (empty list if none) |
| `PendingWithdrawals {}` | `PendingWithdrawalsResponse` | Returns all pending withdrawal proposals (empty list if none) |
| `Balance { asset }` | `BalanceResponse` | Returns treasury balance for specified asset |
| `AllBalances {}` | `AllBalancesResponse` | Returns all treasury holdings (native + whitelisted CW20s) |
| `Cw20Whitelist {}` | `Cw20WhitelistResponse` | Returns list of whitelisted CW20 contract addresses |

#### Asset Handling

The treasury must handle both:
- **Native tokens** (L1): USTC, LUNC, and other Cosmos native denominations
- **CW20 tokens**: Any CW20 token sent to the treasury

For CW20 tokens, the treasury accepts any CW20 token sent to it—no deposit mechanism is required. Users simply send CW20 tokens directly to the treasury address for the best UX. The treasury maintains a **governance-managed whitelist** of known CW20 addresses; the `AllBalances {}` query iterates over this whitelist and queries each token's balance.

**CW20 Abuse Prevention**: While anyone can send any CW20 token to the treasury, **only tokens on the whitelist are counted toward the Collateralization Ratio (CR)**. This prevents a common attack vector where bad actors could:
1. Create a worthless CW20 token
2. Artificially inflate its price on a DEX
3. Send it to the treasury
4. Pull liquidity after the CR is calculated

By requiring governance whitelisting before a token affects CR calculations, the system is protected from this manipulation.

**Decimal Handling**: The system uses each token's on-chain decimal count when calculating CR ratios. This ensures that the CR calculation matches oracle prices regardless of whether a token uses 6 decimals (like native `uusd`), 18 decimals (like most CW20s), or any other decimal configuration.

#### Withdrawal Mechanism

Withdrawals use a two-step process with a 7-day timelock:

1. **ProposeWithdraw**: Governance proposes a withdrawal
```
ProposeWithdraw {
    destination: String,           // Recipient address
    asset: AssetInfo,             // Either Native { denom } or Cw20 { contract_addr }
    amount: Uint128,              // Amount to withdraw
}
```

2. **ExecuteWithdraw**: After 7 days, governance executes the withdrawal
```
ExecuteWithdraw {
    withdrawal_id: String,        // Unique ID returned from ProposeWithdraw
}
```

3. **CancelWithdraw**: Governance can cancel a pending withdrawal
```
CancelWithdraw {
    withdrawal_id: String,        // Unique ID of withdrawal to cancel
}
```

This unified interface allows governance to manage all asset types through a single message pattern, with the timelock providing security against rushed or malicious withdrawals.

#### Security Features

1. **7-Day Timelock**: Both governance address changes and withdrawals require a 7-day waiting period
2. **Two-Step Transfer**: New governance must explicitly accept the role after timelock expires
3. **Two-Step Withdrawal**: Withdrawals must be proposed, then executed after timelock expires
4. **Cancellation**: Current governance can cancel pending transfers and withdrawals
5. **No Direct Access**: Treasury assets can only be moved via explicit withdrawal proposals
6. **Event Emission**: All governance and withdrawal actions emit events for transparency
7. **Multiple Pending Withdrawals**: Multiple withdrawal proposals can exist simultaneously, each with its own timelock

---

### USTC-to-USTR Swap Contract

#### Purpose

The Swap Contract implements a time-limited, one-way exchange mechanism that allows users to convert USTC into USTR at a rate that increases over 100 days, incentivizing early participation.

#### Economic Parameters

| Parameter | Value |
|-----------|-------|
| **Start Rate** | 1.5 USTC per 1 USTR |
| **End Rate** | 2.5 USTC per 1 USTR |
| **Duration** | 100 days (8,640,000 seconds) |
| **Rate Update Frequency** | Continuous (calculated per-second) |
| **Post-Duration Behavior** | No further USTR issuance |

#### Rate Calculation

The exchange rate follows a linear progression:

```
rate(t) = start_rate + ((end_rate - start_rate) * elapsed_seconds / total_seconds)

Where:
- start_rate = 1.5 (1,500,000 in micro units)
- end_rate = 2.5 (2,500,000 in micro units)
- total_seconds = 8,640,000 (100 days)
- elapsed_seconds = current_time - start_time
```

**Precision and Rounding**:
- **Intermediate calculations**: Use 10^18 decimal places to avoid rounding errors at per-second granularity (86,400 seconds per day)
- **Rounding**: Floor rounding is applied to final USTR amounts
- **Minimum swap**: Swaps of less than 1 USTC (1,000,000 micro units) are rejected to prevent dust attacks

**Example progression**:
- Day 0: 1.50 USTC per USTR
- Day 25: 1.75 USTC per USTR
- Day 50: 2.00 USTC per USTR
- Day 75: 2.25 USTC per USTR
- Day 100: 2.50 USTC per USTR
- Day 100+: Swap disabled

#### State

| Field | Type | Description |
|-------|------|-------------|
| `ustr_token` | `Addr` | Address of the USTR CW20 contract |
| `treasury` | `Addr` | Address of the treasury contract (authorized caller for NotifyDeposit) |
| `start_time` | `Timestamp` | Unix timestamp when swap period begins (set at instantiation) |
| `end_time` | `Timestamp` | Unix timestamp when swap period ends (calculated from start_time + duration) |
| `start_rate` | `Decimal` | Initial USTC/USTR rate (1.5) |
| `end_rate` | `Decimal` | Final USTC/USTR rate (2.5) |
| `total_ustc_received` | `Uint128` | Cumulative USTC deposited (tracked via Treasury notifications) |
| `total_ustr_minted` | `Uint128` | Cumulative USTR issued |
| `admin` | `Addr` | Admin address for emergency operations |
| `pending_admin` | `Option<PendingAdmin>` | Proposed new admin with timestamp |
| `paused` | `bool` | Whether swap is currently paused |

```
PendingAdmin {
    new_address: Addr,
    execute_after: Timestamp,  // block time when change can be executed
}
```

**Note**: The Swap contract does not hold USTC. Users send USTC to Treasury via `SwapDeposit`, and Treasury notifies this contract via `NotifyDeposit`. Only the Treasury contract is authorized to call `NotifyDeposit`.

#### Messages

**InstantiateMsg**
- `ustr_token`: USTR contract address
- `treasury`: Treasury contract address
- `start_time`: Unix epoch timestamp when swap period begins (required)
- `start_rate`: Starting exchange rate (1.5)
- `end_rate`: Ending exchange rate (2.5)
- `duration_seconds`: Swap duration (8,640,000 for 100 days)
- `admin`: Admin address for emergencies

**ExecuteMsg**

| Message | Authority | Description |
|---------|-----------|-------------|
| `NotifyDeposit { depositor, amount }` | Treasury only | Called by Treasury when user deposits USTC for swap; mints USTR to depositor |
| `EmergencyPause {}` | Admin | Pauses swap functionality |
| `EmergencyResume {}` | Admin | Resumes swap functionality |
| `ProposeAdmin { new_admin }` | Admin | Initiates 7-day timelock for admin transfer |
| `AcceptAdmin {}` | Pending admin | Completes admin transfer after timelock |
| `CancelAdminProposal {}` | Admin | Cancels pending admin change |
| `RecoverAsset { asset, amount, recipient }` | Admin | Recovers stuck assets sent without using proper methods (available after swap period ends) |

**Note on Tax Optimization**: Users do not call this contract directly. Instead, they send USTC to the Treasury contract via `SwapDeposit {}`, which notifies this contract to mint USTR. This avoids TerraClassic's 0.5% burn tax on `BankMsg::Send`.

**QueryMsg**

| Query | Response | Description |
|-------|----------|-------------|
| `Config {}` | `ConfigResponse` | Returns all contract configuration |
| `CurrentRate {}` | `RateResponse` | Returns current USTC/USTR exchange rate |
| `SwapSimulation { ustc_amount }` | `SimulationResponse` | Returns USTR amount for given USTC |
| `Status {}` | `StatusResponse` | Returns active/ended status, time remaining |
| `Stats {}` | `StatsResponse` | Returns total USTC received, total USTR minted |
| `PendingAdmin {}` | `Option<PendingAdminResponse>` | Returns pending admin proposal details |

#### Swap Flow (Tax-Optimized, Atomic)

The swap uses a two-contract pattern to avoid TerraClassic's 0.5% burn tax. **All steps execute atomically within a single transaction** via CosmWasm submessages:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SINGLE ATOMIC TRANSACTION                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User calls: Treasury.SwapDeposit {} with USTC funds                   │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ TREASURY CONTRACT                                               │   │
│  │ 1. Validate funds are exactly uusd                              │   │
│  │ 2. Reject if < 1 USTC minimum                                   │   │
│  │ 3. Hold USTC (no tax - MsgExecuteContract)                      │   │
│  │ 4. Call Swap.NotifyDeposit via WasmMsg::Execute (submessage)    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                 │
│       ▼ (submessage - same transaction)                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ SWAP CONTRACT                                                   │   │
│  │ 5. Verify caller is authorized Treasury                         │   │
│  │ 6. Verify swap period is active                                 │   │
│  │ 7. Calculate rate based on elapsed time                         │   │
│  │ 8. Calculate ustr_amount = floor(ustc_amount / rate)            │   │
│  │ 9. Mint USTR via WasmMsg::Execute (submessage)                  │   │
│  │ 10. Update statistics, emit event                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                 │
│       ▼ (submessage - same transaction)                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ USTR TOKEN CONTRACT                                             │   │
│  │ 11. Mint USTR to original depositor                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  If ANY step fails → ENTIRE transaction rolls back (USTC returned)     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Atomic Guarantees**: CosmWasm submessages execute within the same transaction context. The Treasury calls Swap via `WasmMsg::Execute`, and Swap calls USTR Token via `WasmMsg::Execute`. If any submessage fails (e.g., swap is paused, period ended, or mint fails), the entire transaction reverts and the user's USTC is returned.

**Why This Flow?** TerraClassic applies a **0.5% Burn Tax** on native token transfers via `BankMsg::Send`. By having users send USTC directly to Treasury via `MsgExecuteContract` (which is NOT taxed), and having Treasury notify the Swap contract (instead of the Swap contract forwarding USTC to Treasury), we ensure 100% of user USTC reaches the treasury.

**On-Chain Tax Handling**: The 0.5% tax is queried via `/terra/tx/v1beta1/compute_tax`. Tax applies to:
- `MsgSend` (wallet → wallet): Taxed
- `MsgExecuteContract` with funds (user → contract): NOT taxed
- `BankMsg::Send` from contract (contract → anywhere): Taxed

**Preregistration Transfer Note**: When transferring USTC from the preregistration contract to the treasury via `BankMsg::Send`, the 0.5% burn tax applies. The treasury receives the post-tax amount, which is accounted for in CR calculations.

#### Edge Cases

- **Minimum amount**: Swaps of less than 1 USTC are rejected by Treasury to prevent dust/rounding attacks (at ~$0.02 per USTC, the cost to execute 1M spam transactions would exceed $20,000, far exceeding any potential exploit profit)
- **Precision handling**: Uses CosmWasm's `Decimal` type (10^18 precision) for intermediate calculations; floor rounding for final amounts
- **Time boundaries**: Precise handling of start/end timestamp boundaries
- **Partial seconds**: Rate calculation uses block timestamp, not simulated continuous time
- **Wrong denomination**: Treasury rejects SwapDeposit with non-USTC native tokens
- **Unauthorized caller**: Swap contract rejects `NotifyDeposit` calls from any address other than Treasury
- **Post-100-day**: Contract is effectively dead after the swap period ends; no reactivation possible

#### Emergency Pause Behavior

When the swap is paused via `EmergencyPause`:
- **Queries remain available**: Users can still query rates, simulate swaps, and check status
- **No maximum duration**: The pause remains until admin calls `EmergencyResume`
- **Admin authority**: Only the admin can resume operations
- **Treasury behavior**: Treasury will reject `SwapDeposit` calls when swap contract is paused (swap contract returns error on `NotifyDeposit`)

#### Post-Swap Period

After day 100, the swap contract is permanently disabled:
- No further swaps can be executed (Treasury's `SwapDeposit` will fail when notifying Swap contract)
- Admin can recover any stuck assets via `RecoverAsset` (for tokens accidentally sent without using the swap method)
- Contract cannot be reactivated

---

### Airdrop Contract

#### Purpose

The Airdrop Contract enables batch distribution of CW20 tokens to multiple recipients in a single transaction, similar to [disperse.app](https://disperse.app). This is used primarily for the preregistration USTR distribution but can be used for any CW20 token distribution.

#### State

| Field | Type | Description |
|-------|------|-------------|
| `admin` | `Addr` | Admin address (for potential future upgrades) |

#### Messages

**InstantiateMsg**
- `admin`: Admin address

**ExecuteMsg**

| Message | Authority | Description |
|---------|-----------|-------------|
| `Airdrop { token, recipients }` | Any user | Distributes CW20 tokens to multiple recipients |

Where `recipients` is an array of:
```
Recipient {
    address: String,
    amount: Uint128,
}
```

**QueryMsg**

| Query | Response | Description |
|-------|----------|-------------|
| `Config {}` | `ConfigResponse` | Returns contract configuration |

#### Airdrop Flow

1. User approves the airdrop contract to spend their CW20 tokens (standard CW20 allowance)
2. User calls `Airdrop { token, recipients }` with the token address and recipient list
3. Contract iterates through recipients and transfers tokens from sender to each recipient
4. If any transfer fails, the entire transaction is rolled back (atomic execution)

#### Constraints

- **No maximum recipients**: The only limit is the TerraClassic block gas limit
- **Atomic execution**: If any individual transfer fails, the entire airdrop fails and is rolled back
- **Caller pays gas**: The user initiating the airdrop pays all gas fees
- **Allowance required**: Sender must have approved sufficient allowance for the total airdrop amount

---

## Economic Model

### USTR Distribution Economics

The swap mechanism creates a natural price discovery and distribution system with two key incentives:

**1. Early Participant Advantage**
- Day 0 participants pay 1.5 USTC per USTR
- Day 100 participants pay 2.5 USTC per USTR
- This creates a 66% premium for late participants, incentivizing early commitment

**2. Schelling Point / Price Ceiling**
- The swap rate creates a natural ceiling on USTR market price
- If USTR trades above the current swap rate, arbitrageurs can swap USTC→USTR and sell
- This provides a "worst case" price anchor, even though mechanically it's only a ceiling

**Supply Distribution**

| Source | USTC Deposited | Rate | USTR Minted |
|--------|----------------|------|-------------|
| Preregistration | Substantial amount | 1:1 (1.0) | Equal USTR |
| Public Swap | Variable | 1.5 → 2.5 | Variable |

**Treasury Accumulation**

All USTC (both preregistration and public swap) flows directly to the treasury as collateral:
- A substantial amount of USTC from preregistration participants (still growing as deposits continue)
- Additional USTC from public swap participants
- This collateral backs future UST1 issuance
- Initial CR = ∞ (infinite) since UST1 supply = 0

### UST1 Collateralization Model (Phase 2)

The UST1 unstablecoin will be issued based on over-collateralization of treasury assets:

**Collateral Basket** (Proposed composition - subject to governance):
- USTC: Primary collateral
- LUNC: Native chain asset
- Other stablecoins: Diversification
- Blue-chip crypto assets: BTC, ETH (via wrapped versions)

**Collateralization Ratio**:
- Minimum: 150% (1.50 USD of collateral per 1 UST1)
- Target: 200% (conservative initial approach)
- Maximum issuance formula: `max_ust1 = total_collateral_value / target_ratio`

---

## Security Considerations

### Smart Contract Security

1. **Reentrancy Protection**: Use CosmWasm's native protections and explicit checks
2. **Integer Overflow**: Use Rust's checked arithmetic and CosmWasm's `Uint128`
3. **Access Control**: Explicit role-based permissions (governance, admin, minter)
4. **Input Validation**: Validate all user inputs and contract addresses
5. **Time Manipulation**: Use block time, not user-provided timestamps

### Governance Security

1. **Timelock**: 7-day delay on governance changes prevents rushed malicious actions
2. **Two-Step Transfer**: Prevents accidental governance loss
3. **Multi-sig Ready**: Governance address can be a multi-sig contract
4. **DAO Upgrade Path**: Architecture supports future DAO governance

### Operational Security

1. **Emergency Pause**: Admin can pause swap in case of discovered vulnerabilities
2. **Monitoring**: Emit comprehensive events for off-chain monitoring
3. **Audit Trail**: All governance actions are logged on-chain
4. **Asset Recovery**: Admin can recover stuck assets after swap period ends

### Contract Immutability

All contracts are deployed as immutable (no proxy or migration pattern). This design choice:

- **Ensures trustlessness**: Users can verify that contract behavior will not change
- **Reduces attack surface**: No upgrade mechanism means no upgrade-based exploits
- **Critical bug handling**: If a critical bug is discovered post-deployment, a new contract must be deployed and users migrated manually

**Mitigation Through Extensive Testing**: Because contracts are immutable, the project employs an extreme testing strategy:

1. **100% unit test coverage**: Every function, branch, and edge case must be tested
2. **Comprehensive integration tests**: Multi-contract interaction flows, complete swap cycles, governance timelocks
3. **Fuzz testing**: Random input generation, boundary conditions, rate calculation precision
4. **Testnet deployment**: Full deployment to rebel-2 with stress testing under realistic conditions
5. **Security review**: Internal code review followed by external audit before mainnet
6. **Community review period**: Public review window before mainnet deployment

This thorough approach ensures that immutability is a security feature rather than a liability.

### Phase 1 Security Trade-offs

For Phase 1, the following trade-offs are accepted:

- **7-day withdrawal timelock**: All treasury withdrawals require a 7-day waiting period before execution, providing protection against compromised admin draining the treasury
- **Centralized control**: Single admin has full control; this is acceptable during bootstrap phase. The 7-day timelock provides a safety buffer for community response

### Audit Requirements

Before mainnet deployment:
- Internal code review
- External smart contract audit (recommended)
- Testnet deployment and stress testing
- Community review period

---

## Governance & Upgrade Path

### Phase 1: Admin Governance (Current)

Initial governance is a single admin EOA (externally owned account) with control over:
- Treasury withdrawals
- Emergency swap pause/resume
- Setting swap start time
- Minting USTR for preregistration participants

**Same address controls both**: The swap contract `admin` and treasury contract `governance` are the same address, simplifying operations while 7-day timelocks on address changes provide security.

This centralized approach enables rapid response during the bootstrap phase.

### Phase 2: Multi-Signature

Transition to a multi-signature setup:
- 3-of-5 or similar threshold scheme
- Geographic and jurisdictional distribution
- Defined signers from community

**Important Clarification**: The multi-sig signers are **security layer volunteers only**—they are not owners of the protocol and do not receive any profits, fees, or financial benefits from their role. Their sole purpose is to provide an additional security layer by approving or vetoing governance actions.

**3-of-5 Multi-Sig Dashboard**:
- A dedicated dashboard will be provided with **human-readable explanations** of all proposals
- **Only the dev admin can create proposals**—this reduces risk from multi-sig wallet holders' potential lack of technical knowledge or loss of keys
- The multi-sig exists **solely as a veto system** to prevent a compromised dev admin wallet from harming the protocol
- Multi-sig signers review proposals and either approve or veto; they cannot create, modify, or independently execute protocol actions
- This design ensures that even if the dev admin's keys are compromised, malicious proposals can be blocked by the multi-sig security layer

### Phase 3: DAO Governance

Full decentralization through on-chain governance:
- **Note**: Neither USTR nor UST1 is the governance token
- Governance will be backed by **CL8Y nodes** (NFT-based governance system from [CL8Y.com](https://cl8y.com))
- Proposal submission with quorum requirements
- Timelock on passed proposals
- Delegation support

The 7-day timelock on admin/governance address changes in both contracts is designed to accommodate the transition to DAO governance without requiring contract upgrades.

**Governance Transition Mechanism**: When CL8Y governance is deployed, the admin/governance address in the treasury and swap contracts will be changed to point to the CL8Y governance contract. The governance contract will then call the appropriate execute methods on behalf of token holders. The specifics of CL8Y governance (node acquisition, voting weights, quorum requirements) are outside the scope of this proposal.

**Multi-sig Configuration** (Phase 2): A 3-of-5 or similar threshold scheme is planned, but specific keyholders have not yet been determined. Note that multi-sig signers serve as a security veto layer only—they do not own the protocol or receive any financial compensation.

---

## Frontend Application

### Overview

The frontend provides a user-friendly interface for interacting with the USTR CMM system. It will be built as a static site without server-side rendering.

### Core Features

**1. Wallet Connection** (All three required for MVP)
- Terra Station wallet integration
- WalletConnect support
- Keplr wallet compatibility
- Mobile wallet deep linking

**2. Swap Interface**
- Real-time exchange rate display
- USTC input with USTR output preview
- Time remaining indicator
- Rate progression visualization
- Transaction history

**3. Dashboard**
- User's USTR balance
- User's USTC balance
- Historical swap transactions
- Current swap rate with trend indicator

**4. Treasury View**
- Total treasury holdings (public data)
- Asset breakdown visualization
- Historical treasury growth chart
- **Collateralization Ratio (CR) display with trend line**
- Current CR tier indicator (RED/YELLOW/GREEN/BLUE)

**5. Single Source of Truth (SSoT) Dashboard**

The SSoT Dashboard serves as the **authoritative reference** for the CMM system state:
- **CR Ratios**: Real-time and historical collateralization ratio tracking
- **Basket of Assets**: Complete breakdown of treasury holdings with valuations
- **System State**: Current tier, pool balances, distribution rates
- **Whitelist Status**: Which CW20 tokens are counted toward CR
- **Oracle Prices**: Current price feeds used for CR calculations

This dashboard eliminates reliance on third-party data aggregators that may report information incorrectly. Given the CW20 abuse vector (where false tokens could affect ratios if not properly filtered), having an authoritative SSoT prevents misinformation and gives users confidence in the true system state.

**6. Governance Interface** (for admin)
- Propose governance change
- Accept pending governance
- Cancel governance proposal
- Withdraw assets (with confirmation flow)

**7. Multi-Sig Dashboard** (Phase 2)
- Human-readable proposal summaries
- Proposal approval/veto interface
- Multi-sig signer status
- Pending proposal queue with explanations

### Technical Stack

| Component | Technology |
|-----------|------------|
| Framework | React with TypeScript |
| Styling | TailwindCSS with custom design system |
| State Management | React Query for server state, Zustand for client state |
| Wallet Integration | Terra Station, WalletConnect, and Keplr (all required for MVP) |
| Build Tool | Vite |
| Deployment | Static hosting (Vercel, Netlify, IPFS) |

**Wallet Integration Reference**: Implementation patterns for multi-wallet support (Terra Station, WalletConnect, Keplr) can be adapted from the [cmm-ustc-preregister frontend](https://github.com/PlasticDigits/cmm-ustc-preregister/tree/main/frontend-dapp/src).

### Design Principles

1. **Clarity**: Clear information hierarchy, obvious call-to-action buttons
2. **Real-time Updates**: Live rate updates via WebSocket or polling
3. **Error Handling**: Graceful error states with actionable feedback
4. **Mobile-First**: Responsive design, touch-friendly interactions
5. **Accessibility**: WCAG 2.1 AA compliance
6. **Performance**: Efficient caching to minimize RPC calls 

### Key User Flows

**Swap Flow**
1. Connect wallet
2. View current rate and time remaining
3. Enter USTC amount
4. See estimated USTR output
5. Confirm transaction in wallet
6. View success/pending state
7. See updated balances

**Rate Monitoring Flow**
1. View current rate
2. See rate progression chart
3. Set price alerts (optional, via notifications)
4. Compare entry points

---

## Project Structure

```
ustr-cmm/
├── contracts/                    # Smart contract workspace
│   ├── Cargo.toml               # Workspace manifest
│   ├── contracts/
│   │   ├── ustr-token/          # USTR CW20 token (based on cw20-mintable)
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │       ├── lib.rs
│   │   │       ├── contract.rs
│   │   │       ├── msg.rs
│   │   │       ├── state.rs
│   │   │       └── error.rs
│   │   │
│   │   ├── treasury/            # Treasury contract
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │       ├── lib.rs
│   │   │       ├── contract.rs
│   │   │       ├── msg.rs
│   │   │       ├── state.rs
│   │   │       └── error.rs
│   │   │
│   │   └── ustc-swap/           # USTC→USTR swap contract
│   │       ├── Cargo.toml
│   │       └── src/
│   │           ├── lib.rs
│   │           ├── contract.rs
│   │           ├── msg.rs
│   │           ├── state.rs
│   │           └── error.rs
│   │
│   ├── packages/                # Shared libraries
│   │   └── common/              # Common types, helpers
│   │       ├── Cargo.toml
│   │       └── src/
│   │           ├── lib.rs
│   │           └── asset.rs     # Asset type definitions
│   │
│   └── scripts/                 # Deployment and management scripts
│       ├── deploy.sh
│       ├── instantiate.json
│       └── README.md
│
├── frontend/                    # Frontend application
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   ├── public/
│   │   └── assets/
│   │
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── layout/
│       │   ├── swap/
│       │   ├── dashboard/
│       │   └── common/
│       ├── hooks/
│       │   ├── useContract.ts
│       │   ├── useSwap.ts
│       │   └── useWallet.ts
│       ├── services/
│       │   └── contract.ts
│       ├── stores/
│       │   └── wallet.ts
│       ├── types/
│       │   └── contracts.ts
│       └── utils/
│           ├── format.ts
│           └── constants.ts
│
├── docs/                        # Additional documentation
│   ├── ARCHITECTURE.md
│   ├── CONTRACTS.md
│   └── DEPLOYMENT.md
│
├── PROPOSAL.md                  # This document
├── README.md                    # Project overview
└── .nvmrc                       # Node version specification
```

---

## Development Phases

### Phase 1: Foundation (Current)

**Duration**: 4-6 weeks

**Deliverables**:
1. USTR token contract (based on cw20-mintable)
2. Treasury contract with 7-day governance timelock
3. USTC→USTR swap contract with linear rate progression and 7-day admin timelock
4. Airdrop contract for batch CW20 token distribution (similar to disperse.app)
5. Airdrop dapp interface for inputting CW20 address and recipient list
6. Frontend swap interface with Terra Station, WalletConnect, and Keplr support
7. Testnet deployment (rebel-2)
8. 100% test coverage for smart contracts

**Milestones**:
- Week 1-2: Contract development and unit tests
- Week 3: Integration tests, testnet deployment
- Week 4: Frontend development (including airdrop dapp)
- Week 5: Testing, bug fixes
- Week 6: Security review, documentation

### Phase 1.5: Mainnet Launch & Preregistration Migration

**Duration**: 1-2 weeks

**Deliverables**:
1. Mainnet deployment (columbus-5)
2. Transfer 16.7M USTC from preregistration contract to treasury
3. Airdrop 16.7M USTR to preregistration participants (1:1 ratio) via single batch transaction
4. Handle BSC preregistration deposits via CSV export and admin verification
5. Activate public swap (start time set during instantiation)
6. Monitoring and support infrastructure

**Preregistration Distribution Process**:
1. Query participant addresses and balances from the existing preregistration contract
2. Prepare airdrop transaction using the airdrop contract
3. Execute single batch airdrop of USTR to all participants
4. For BSC participants: verify against BSC smart contract, prepare CSV, process administratively

**Prerequisites**:
- All Phase 1 testing complete
- External audit completed (if required)
- Preregistration participant list finalized (queried from preregistration contract)
- BSC participant list verified and exported as CSV
- Community announcement and education

### Phase 2: UST1 Development

**Duration**: 6-8 weeks (after swap period ends)

**Deliverables**:
1. UST1 token contract
2. Collateralization management contract
3. Oracle integration for asset pricing
4. Mint/redeem mechanism
5. Frontend updates for UST1 operations

### Phase 3: DAO Transition

**Duration**: 4-6 weeks

**Deliverables**:
1. Governance token (likely CL8Y-backed)
2. Governance contract deployment
3. Proposal system
4. Voting mechanism
5. Treasury governance transition
6. Frontend governance interface

---

## Testing Strategy

### Smart Contract Testing

**Unit Tests**
- Individual function testing
- Edge case coverage
- Error condition verification
- 100% code coverage requirement

**Integration Tests**
- Multi-contract interaction flows
- Complete swap flow testing
- Governance timelock testing
- Treasury withdrawal testing

**Fuzz Testing**
- Random input generation
- Boundary condition testing
- Rate calculation precision testing

### Frontend Testing

**Unit Tests**
- Component rendering
- Hook behavior
- Utility function correctness

**Integration Tests**
- Wallet connection flow
- Contract interaction
- Error handling

**E2E Tests**
- Complete user flows
- Cross-browser compatibility
- Mobile responsiveness

### Testnet Validation

1. Deploy all contracts to rebel-2 testnet
2. Execute complete swap flow with test tokens
3. Verify governance timelock behavior
4. Stress test with multiple concurrent swaps
5. Validate rate calculations at various time points

---

## Deployment Plan

### Contract Deployment Order

1. **USTR Token**
   - Deploy using cw20-mintable Code ID 1641 (testnet) or 10184 (mainnet)
   - Initial minter: Deployer address (temporary)

2. **Treasury Contract**
   - Deploy with governance set to admin wallet
   - Verify 7-day timelock is configured

3. **Swap Contract**
   - Deploy with references to USTR token and treasury
   - Set start time, rates, and duration

4. **Post-Deployment Configuration**
   - Add swap contract as USTR minter
   - Remove deployer from USTR minters list
   - Transfer initial USTC to treasury (accounting for burn tax)
   - Verify all permissions

### Network Configuration

**Testnet (rebel-2)**
```
Chain ID: rebel-2
RPC: https://terra-classic-testnet-rpc.publicnode.com
LCD: https://terra-classic-testnet-lcd.publicnode.com
```

**Mainnet (columbus-5)**
```
Chain ID: columbus-5
RPC: https://terra-classic-rpc.publicnode.com
LCD: https://terra-classic-lcd.publicnode.com
```

### Deployment Verification

After each deployment:
1. Query contract state
2. Verify configuration parameters
3. Test basic operations
4. Document contract addresses

---

## Risk Analysis

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Smart contract vulnerability | High | Medium | Audit, testing, bug bounty |
| Rate calculation precision errors | Medium | Low | Extensive testing, formal verification |
| Frontend security issues | Medium | Medium | Security best practices, CSP |
| RPC node reliability | Low | Medium | Multiple RPC endpoints, fallbacks |

### Economic Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Low public swap participation | Low | Medium | Preregistration already secures 16.7M USTR distribution |
| USTC price volatility | Medium | High | Collateral diversification via auctions (Phase 2) |
| USTR price above swap ceiling | Low | Low | Arbitrage naturally caps price at swap rate |
| Governance capture | High | Low | 7-day timelocks, future DAO transition |

### Operational Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Key compromise | High | Low | Multi-sig, hardware wallets |
| Admin unavailability | Medium | Low | Clear succession plan |
| Network congestion | Low | Medium | Appropriate gas settings |

---

## Future Roadmap

### Near-Term (6 months)

- UST1 unstablecoin launch with USTC collateral
- Collateral auction mechanism for treasury to acquire diversified assets
- CR tier system implementation (RED/YELLOW/GREEN/BLUE)
- USTR LP provision via collateral auctions (enables trading)
- Basic DAO governance framework (CL8Y-backed)

### Medium-Term (12 months)

- 5-year rolling distribution pools (when CR > 190%):
  - UST1 staking pool
  - USTR automatic buy-and-burn pool
  - USTR staking pool
- Additional collateral types via auction (LUNC, wrapped BTC/ETH)
- Advanced oracle integration for CR calculations
- Mobile application

### Long-Term (24 months)

- Full decentralized governance
- Cross-chain bridge for UST1
- Multi-chain expansion (other Cosmos chains)
- Lending/borrowing protocols integration
- Additional unstablecoin denominations (e.g., EUR, JPY targets)

---

## Conclusion

The USTR CMM project establishes the foundation for a sustainable, collateralized unstablecoin system on TerraClassic. By implementing a carefully designed token distribution mechanism, secure treasury management, and a clear upgrade path, the project aims to:

1. **Honor preregistration commitments**: USTR minted 1:1 for early USTC depositors
2. **Incentivize further participation**: Time-decaying swap rate rewards early public participants
3. **Build a transparent, over-collateralized reserve**: All USTC flows to treasury as UST1 collateral
4. **Create infrastructure for UST1**: Collateralization ratio tiers (RED/YELLOW/GREEN/BLUE) govern minting and redemption
5. **Enable USTR utility**: Future staking pools, LP auctions, and buy-and-burn mechanisms
6. **Transition toward community governance**: Admin → Multi-sig → DAO (with CL8Y-backed governance token)

The phased approach allows for careful validation at each stage while maintaining momentum toward the ultimate goal of a decentralized unstablecoin ecosystem where UST1 gravitates toward its $1 target through transparent, on-chain collateralization—without the rigid peg mechanics that create death spiral risk.

---

## Appendix A: Contract Interface Summaries

### USTR Token (CW20 Mintable)

Based on PlasticDigits/cw20-mintable with Code ID 10184 (mainnet) / 1641 (testnet).

Standard CW20 interface plus:
- `AddMinter { minter }`: Add address to minters list
- `RemoveMinter { minter }`: Remove address from minters list
- `Mint { recipient, amount }`: Mint tokens (minters only)
- `Minters {}`: Query all minter addresses

### Treasury Contract

**Execute**:
- `ProposeGovernanceTransfer { new_governance }` - Add governance proposal (multiple can exist)
- `AcceptGovernanceTransfer {}` - Accept proposal for sender's address after timelock
- `CancelGovernanceTransfer { proposed_governance }` - Cancel specific proposal
- `ProposeWithdraw { destination, asset, amount }` - Propose withdrawal with 7-day timelock
- `ExecuteWithdraw { withdrawal_id }` - Execute pending withdrawal after timelock expires
- `CancelWithdraw { withdrawal_id }` - Cancel specific pending withdrawal
- `AddCw20 { contract_addr }` - Add CW20 to balance tracking whitelist
- `RemoveCw20 { contract_addr }` - Remove CW20 from whitelist
- `Receive(Cw20ReceiveMsg)` - CW20 receive hook for accepting token transfers

**Query**:
- `Config {}`
- `PendingGovernance {}` - Returns all pending governance proposals
- `PendingWithdrawals {}` - Returns all pending withdrawal proposals
- `Balance { asset }`
- `AllBalances {}` - Returns native + whitelisted CW20 balances
- `Cw20Whitelist {}` - Returns list of whitelisted CW20 addresses

### Airdrop Contract

Batch CW20 token distribution contract (similar to [disperse.app](https://disperse.app)).

**Execute**:
- `Airdrop { token, recipients }`: Distributes CW20 tokens to multiple recipients in a single transaction
  - `token`: CW20 contract address
  - `recipients`: Array of `{ address, amount }` pairs
  - Requires sender to have approved sufficient CW20 allowance
  - Atomic: entire airdrop fails if any transfer fails
  - No maximum recipients (limited only by block gas limit)

**Query**:
- `Config {}`: Returns contract configuration

### USTC Swap Contract

**Execute**:
- `Swap {}` (with native USTC `uusd` funds; minimum 1 USTC)
- `EmergencyPause {}` (admin only)
- `EmergencyResume {}` (admin only)
- `ProposeAdmin { new_admin }` (initiates 7-day timelock)
- `AcceptAdmin {}` (pending admin only, after timelock)
- `CancelAdminProposal {}` (admin only)
- `RecoverAsset { asset, amount, recipient }` (admin only, after swap period ends)

**Query**:
- `Config {}`
- `CurrentRate {}`
- `SwapSimulation { ustc_amount }`
- `Status {}`
- `Stats {}`
- `PendingAdmin {}`

---

## Appendix B: Economic Calculations

### Rate Formula

```
rate(t) = 1.5 + (1.0 × elapsed_days / 100)

Where:
- elapsed_days = (current_time - start_time) / 86400
- Result: USTC required per 1 USTR
```

### USTR Distribution Examples

**Preregistration Participants**

| Participant | USTC Deposited | Rate | USTR Received |
|-------------|----------------|------|---------------|
| All preregistration users | Substantial amount | 1.0 (1:1) | Equal USTR |

**Public Swap Examples**

| User | Day | USTC Deposited | Rate (USTC/USTR) | USTR Received | Calculation |
|------|-----|----------------|------------------|---------------|-------------|
| Alice | 0 | 15,000 USTC | 1.50 | 10,000 USTR | 15,000 / 1.50 |
| Bob | 25 | 17,500 USTC | 1.75 | 10,000 USTR | 17,500 / 1.75 |
| Carol | 50 | 20,000 USTC | 2.00 | 10,000 USTR | 20,000 / 2.00 |
| Dave | 75 | 22,500 USTC | 2.25 | 10,000 USTR | 22,500 / 2.25 |
| Eve | 100 | 25,000 USTC | 2.50 | 10,000 USTR | 25,000 / 2.50 |

**Key Observations**:
- Alice (Day 0) pays **40% less** than Eve (Day 100) for the same 10,000 USTR
- This 66% premium for late participants incentivizes early commitment
- All deposited USTC (92,500 in these examples) goes directly to treasury as collateral

### Treasury Growth Example

| Event | Description | Effect |
|-------|-------------|--------|
| Launch (preregistration) | Initial USTC transferred | CR = ∞ (BLUE tier) |
| Day 0 swaps | Public swap begins at 1.5 rate | Treasury grows, USTR minted |
| Day 50 swaps | Rate at 2.0 | More USTC per USTR |
| Day 100 (end) | Rate at 2.5, swap closes | Final treasury + supply determined |

*Note: Actual totals depend on participation. Preregistration deposits are ongoing.*

---

*Document prepared for USTR CMM project. Subject to revision based on community feedback and technical discoveries during development.*

*For comprehensive economic theory, design rationale, and academic references, see [docs/ECONOMICS.md](./docs/ECONOMICS.md).*

