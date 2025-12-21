# USTR CMM Economic Design

> **A Comprehensive Guide to the Economics of the Collateralized Unstablecoin System**

This document explains the economic theory, mechanisms, and rationale behind every component of the USTR CMM system. It is written for investors, developers, community members, and anyone seeking to understand why this system is designed the way it is.

---

## Table of Contents

1. [Introduction: Why Economics Matters](#introduction-why-economics-matters)
2. [The Problem: Why Algorithmic Stablecoins Fail](#the-problem-why-algorithmic-stablecoins-fail)
   - [Unbounded Volatility: The Hidden Risk](#unbounded-volatility-the-hidden-risk)
3. [The Solution: Collateralized Unstablecoins](#the-solution-collateralized-unstablecoins)
4. [Core Economic Concepts](#core-economic-concepts)
   - [The Functions of Money](#the-functions-of-money)
   - [Credit Chains and Units of Account](#credit-chains-and-units-of-account)
   - [The Impossible Trilemma](#the-impossible-trilemma)
   - [Antifragility Through Controlled Volatility](#antifragility-through-controlled-volatility)
5. [USTR Token Economics](#ustr-token-economics)
   - [Distribution Mechanism](#distribution-mechanism)
   - [Path to $1: The Long-Term Vision](#path-to-1-the-long-term-vision)
   - [The Inflation Advantage](#the-inflation-advantage)
6. [UST1 Unstablecoin Economics](#ust1-unstablecoin-economics)
   - [What is an Unstablecoin?](#what-is-an-unstablecoin)
   - [Collateralization Ratio Tiers](#collateralization-ratio-tiers)
   - [Why These Specific Thresholds?](#why-these-specific-thresholds)
7. [Treasury and Collateral Management](#treasury-and-collateral-management)
   - [Collateral Diversification Strategy](#collateral-diversification-strategy)
   - [USTC as Foundation Collateral](#ustc-as-foundation-collateral)
   - [Long-Term Collateral Growth](#long-term-collateral-growth)
8. [Auction Mechanism Design](#auction-mechanism-design)
   - [Why English Auctions?](#why-english-auctions)
   - [Preventing Cartelization](#preventing-cartelization)
   - [Bidding Incentives](#bidding-incentives)
9. [5-Year Rolling Distribution Pools](#5-year-rolling-distribution-pools)
   - [Economic Rationale](#economic-rationale)
   - [Counter-Cyclical Monetary Policy](#counter-cyclical-monetary-policy)
   - [Pool Mechanics](#pool-mechanics)
10. [Monetary Policy Tools](#monetary-policy-tools)
    - [Open Market Operations](#open-market-operations)
    - [Capital Controls](#capital-controls)
    - [The Cantillon Effect](#the-cantillon-effect)
11. [Risk Analysis and Mitigation](#risk-analysis-and-mitigation)
    - [Death Spiral Prevention](#death-spiral-prevention)
    - [Bear Market Survival](#bear-market-survival)
    - [Black Swan Events](#black-swan-events)
12. [Comparison with Other Systems](#comparison-with-other-systems)
    - [Original USTC/LUNA: Lessons Learned](#original-ustcluna-lessons-learned)
    - [MakerDAO (DAI)](#makerdao-dai)
    - [Frax](#frax)
    - [Liquity (LUSD)](#liquity-lusd)
    - [Synthesis: The Combined Design Advantage](#synthesis-the-combined-design-advantage)
13. [The Philosophy: Denationalization of Currency](#the-philosophy-denationalization-of-currency)
14. [Governance Economics](#governance-economics)
15. [Summary: Why This Design Works](#summary-why-this-design-works)
16. [Bibliography](#bibliography)

---

## Introduction: Why Economics Matters

Smart contract code can be perfect and still fail catastrophically if the underlying economics are flawed. The original USTC is proof: technically functional contracts that collapsed because the economic model couldn't withstand market stress.

This document explains the economic reasoning behind every design decision in USTR CMM. Understanding these principles helps you:

- **As an investor**: Evaluate the long-term viability and risk profile
- **As a developer**: Understand why the code is structured the way it is
- **As a community member**: Make informed governance decisions
- **As a skeptic**: Identify potential weaknesses and suggest improvements

We draw on established economic theory, historical precedent, and lessons from both traditional finance and DeFi failures to build a system designed for long-term survival.

---

## The Problem: Why Algorithmic Stablecoins Fail

### The Death Spiral Mechanism

Algorithmic stablecoins attempt to maintain a price peg through supply manipulation without holding sufficient collateral. When confidence wavers:

1. **Selling pressure begins**: Users try to exit
2. **Price drops below peg**: The algorithm mints more of the companion token (like LUNA)
3. **Companion token dilutes**: Its value drops
4. **Confidence falls further**: More users exit
5. **Feedback loop accelerates**: The system enters a "death spiral"
6. **Equilibrium at zero**: Without intervention, both tokens become worthless

Research by Lyons & Viswanath-Natraj (2019) demonstrated empirically that algorithmic stablecoins are **incapable of functioning as a reliable unit of account** due to this dynamic.

### The USTC/LUNA Collapse

The original Terra system used open market operations between USTC and LUNA to maintain the peg. This worked during growth periods but had a fatal flaw: **no collateral backing**.

When market stress hit:
- USTC holders rushed to exit
- LUNA was minted to absorb the sell pressure
- LUNA's price collapsed under dilution
- The mechanism that was supposed to restore the peg instead accelerated the collapse
- Billions of dollars evaporated in days

### The Core Lesson

**Without collateral, algorithmic stabilization is a house of cards.** The mechanism works only as long as everyone believes it works: a classic confidence game that eventually fails.

### Unbounded Volatility: The Hidden Risk

Research has demonstrated that **all stablecoins exhibit unbounded volatility**—meaning extreme price events can occur that would be structurally impossible for assets without a peg mechanism.

**Bounded vs. Unbounded Volatility:**

| Property | Bounded (e.g., BTC) | Unbounded (Stablecoins) |
|----------|---------------------|-------------------------|
| **Price floor** | $0 (theoretical) | Can collapse entirely in hours |
| **Extreme events** | Rare, gradual | Can be sudden and total |
| **Recovery potential** | Always possible with demand | May be impossible once confidence breaks |
| **Volatility source** | Market supply/demand | Peg mechanism failure |

**Why stablecoins have unbounded volatility:**

1. **Peg maintenance creates fragility**: The very mechanism designed to stabilize prices can amplify crashes when it fails
2. **Confidence dependency**: Unlike BTC which has no "correct" price, stablecoins have a target—deviating from it signals failure
3. **Redemption cascades**: When a stablecoin trades below peg, rational actors rush to exit, creating self-reinforcing selling pressure
4. **Collateral correlation**: During market stress, collateral values often fall precisely when redemption demand spikes

**Historical examples of unbounded volatility:**

| Event | Stablecoin | Depeg | Recovery |
|-------|------------|-------|----------|
| May 2022 | UST (Terra) | $1 → $0.02 | None (collapsed) |
| March 2023 | USDC | $1 → $0.87 | Yes (bank crisis resolved) |
| March 2023 | DAI | $1 → $0.85 | Yes (USDC exposure resolved) |
| June 2021 | IRON | $1 → $0.75 → $0 | None (death spiral) |

Bitcoin, by contrast, has experienced 80%+ drawdowns but has always recovered because there is no "peg" to break—its value is purely what the market will pay. A stablecoin at $0.20 is a failed stablecoin; Bitcoin at any price is still Bitcoin.

**Implications for UST1:**

This is precisely why UST1 is designed as an **unstablecoin** rather than a stablecoin:

- **No rigid peg to break**: Price deviations don't signal system failure
- **Collateral backing**: Real assets support value even during stress
- **Lockout mechanism**: RED tier prevents the redemption cascades that cause unbounded volatility
- **Time-based recovery**: The system is designed to survive extreme events and recover, not prevent them entirely

By accepting that extreme events *will* occur and designing for survival rather than prevention, UST1 transforms unbounded volatility risk into bounded, manageable risk.

---

## The Solution: Collateralized Unstablecoins

### What Makes This Different

USTR CMM addresses the fundamental flaw by:

1. **Requiring real collateral**: Every UST1 is backed by assets held in the treasury
2. **Embracing flexibility**: UST1 is an "unstablecoin" that gravitates toward $1 rather than rigidly pegging
3. **Building antifragility**: The system gets stronger under stress rather than weaker
4. **Using time as an ally**: USD inflation guarantees long-term collateral appreciation

### The Unstablecoin Concept

| Aspect | Stablecoin | Unstablecoin (UST1) |
|--------|------------|---------------------|
| **Design Goal** | Track $1 exactly | Target $1 with market-determined price |
| **Price Behavior** | Deviations are failures | Fluctuations are normal and healthy |
| **Collateral Type** | Stable assets (US Treasuries, USD) | Can include volatile crypto assets |
| **Risk Profile** | Vulnerable to death spirals | Absorbs volatility safely |
| **Bank Run Risk** | High if confidence lost | Low; no forced peg means no panic |

By not rigidly forcing a peg, UST1 can safely hold volatile crypto assets as collateral without triggering cascading liquidations when those assets drop in value.

---

## Core Economic Concepts

### The Functions of Money

Money serves three primary functions in economic theory:

**1. Medium of Exchange**
Money facilitates transactions by providing a widely accepted intermediary instrument (Doepke & Schneider, 2017). Without money, we'd need barter—finding someone who has what you want AND wants what you have.

**2. Unit of Account**
Money provides a consistent metric for pricing goods and services. This is arguably the most critical function because it enables economic calculation, contracts, and debt.

**3. Store of Value**
Money allows purchasing power to be preserved over time. This depends on the currency's stability and resistance to inflation.

### Credit Chains and Units of Account

The **unit of account function is especially critical** due to credit chains (Kiyotaki & Moore, 1997).

**What are credit chains?**

Credit chains are the web of borrowing and lending relationships throughout an economy. When you get a mortgage, the bank funds it partly from deposits, which themselves might come from businesses that borrowed from other banks. This creates an interconnected chain of debt.

**Why does this matter for UST1?**

When the unit of account is unstable:
- Borrowers and lenders face uncertain real values
- Contracts become risky to write
- The entire credit chain can seize up during shocks

A **dominant, stable unit of account** reduces these risks by:
- Aligning assets and debts in the same valuation metric
- Lowering default risk from balance sheet price fluctuations
- Enabling predictable outcomes even during economic fluctuations

This is why UST1 targets $1: not as a rigid peg, but as an accounting anchor that enables reliable economic activity.

### The Impossible Trilemma

The Mundell-Fleming trilemma (Mundell, 1963) states that an economy cannot simultaneously achieve all three:

1. **Fixed exchange rate** (stable price)
2. **Free capital flows** (unrestricted trading)
3. **Independent monetary policy** (ability to control money supply)

**Traditional stablecoins try to achieve all three and fail.**

UST1's solution: **implement partial capital controls** through auction-based supply management. Users can't mint or redeem UST1 instantly at will. Instead, supply changes happen through governance-controlled auctions with fees that vary based on market conditions.

This sacrifice of absolute capital freedom enables both price stability and monetary policy flexibility.

### Antifragility Through Controlled Volatility

Nassim Taleb's concept of **antifragility** (Taleb, 2012) describes systems that gain from disorder:

> "Some things benefit from shocks; they thrive and grow when exposed to volatility, randomness, disorder, and stressors."

By implementing partial capital controls (fees on treasury swaps), UST1:
- Introduces calculated randomness
- Generates revenue during market stress
- Increases collateral backing through fee collection
- Builds reserves that make future stress easier to handle

This is the opposite of a rigid peg, which becomes more fragile under stress. Every market shock that UST1 survives makes it stronger.

---

## USTR Token Economics

### Distribution Mechanism

USTR is distributed through two channels:

**1. Preregistration (1:1 Rate)**
- 16.7 million USTR for early participants
- Each 1 USTC deposited = 1 USTR received
- Rewards the earliest believers who took the most risk

**2. Public Swap (Time-Decaying Rate)**
- 100-day swap period
- Rate increases from 1.5 to 2.5 USTC per USTR
- Early participants pay 40% less than late participants
- Creates urgency and rewards conviction

| Day | USTC per USTR | Premium vs Day 0 |
|-----|---------------|------------------|
| 0 | 1.50 | — |
| 25 | 1.75 | +17% |
| 50 | 2.00 | +33% |
| 75 | 2.25 | +50% |
| 100 | 2.50 | +67% |

This mechanism creates a natural **Schelling point** and price ceiling for USTR—if it trades above the current swap rate, arbitrageurs can mint new USTR and sell it.

### Path to $1: The Long-Term Vision

**The ultimate goal is to bring USTR's price to $1, while burning as much supply as possible, then slowly reducing supply to zero.**

This happens through several mechanisms:

**Phase 1: Initial Accumulation**
- USTR trades below $1 due to abundant supply
- The treasury accumulates USTC collateral
- UST1 system launches with infinite collateralization ratio

**Phase 2: Buy-and-Burn Program**
- When UST1's collateralization ratio exceeds 190% (BLUE tier), new UST1 is minted
- A portion of this UST1 is allocated to a buy-and-burn pool
- The pool automatically purchases USTR from the market and destroys it
- Supply decreases, price increases

**Phase 3: Convergence to $1**
- As USTR supply shrinks and demand grows, price approaches $1
- Staking yields attract remaining holders
- Market depth increases

**Phase 4: Terminal Phase**
- Once USTR reaches $1, the system continues buying and burning
- USTR supply gradually approaches zero
- Remaining USTR holders benefit from the final buyouts

### The Inflation Advantage

**This is the key insight that guarantees long-term success:**

As long as the treasury's collateral maintains stable *real* value (purchasing power), USD inflation will eventually create enough *nominal* value to fund USTR's path to $1.

**How this works:**

1. UST1 is denominated in USD—its liability stays at $1 nominal
2. USD experiences ~2-7% annual inflation (M2 money supply growth)
3. Treasury collateral (especially crypto assets) tends to appreciate with M2 growth
4. Over time, collateral value grows faster than UST1 liabilities
5. The excess value funds USTR appreciation and buy-backs

**Example:**
- Treasury holds $20M in collateral
- UST1 supply is 10M tokens ($10M liability)
- Collateralization ratio: 200%
- After 10 years of 5% average inflation, collateral is worth $32.6M in nominal terms
- UST1 liability remains $10M (same supply at $1 target)
- New CR: 326%
- Excess $22.6M can fund massive USTR buy-and-burn

**The timing challenge:**

The economics guarantee eventual success, but *how fast* can we get there? The 5-year rolling pools, aggressive buy-and-burn during BLUE tier, and staking incentives are all designed to accelerate this timeline.

**Early capitulation is part of the design:**

Yields will be very low initially due to the 5-year rolling distribution. This may cause early participants to sell their USTR cheaply. But this actually helps:
- The CMM can buy USTR cheaply
- More supply is destroyed per dollar spent
- Price appreciation accelerates later
- Patient holders are rewarded

---

## UST1 Unstablecoin Economics

### What is an Unstablecoin?

An unstablecoin is a collateralized token that **targets** a price (like $1) rather than **pegging** to it.

**Key differences from stablecoins:**

| Feature | Stablecoin | Unstablecoin |
|---------|------------|--------------|
| Price at $0.95 | Crisis requiring intervention | Normal; market forces will correct |
| Price at $1.05 | Arbitrage opportunity or failure | Normal; indicates strong demand |
| Collateral drops 30% | Potential liquidation cascade | CR tier may change; system continues |
| Bank run scenario | Existential threat | No forced redemptions; patience wins |

Because UST1 doesn't promise instant redemption at exactly $1, there's no reason to panic when the price deviates. The collateral backing provides confidence that the value is recoverable over time.

### Collateralization Ratio Tiers

The system operates in four tiers based on collateralization ratio (CR):

| Tier | CR Range | System Behavior | Economic Effect |
|------|----------|-----------------|-----------------|
| 🔴 **RED** | < 95% | All operations locked | Prevents death spiral |
| 🟡 **YELLOW** | 95% – 110% | Only buy-collateral auctions | Rebuilds backing |
| 🟢 **GREEN** | 110% – 190% | Adds redemption auctions | Creates buy pressure |
| 🔵 **BLUE** | > 190% | UST1 minting enabled | Controlled expansion |

**RED Tier: Emergency Lockdown**

When CR drops below 95%, the system completely locks. No minting, no redemption, no auctions. Collateral is frozen until market recovery.

*Why this works:* Bear markets caused by M2 supply contraction historically recover within 5 years. High-quality collateral (BTC, ETH, quality stablecoins) will regain value as monetary policy normalizes. Patience is rewarded; panic is prevented.

**YELLOW Tier: Recovery Mode**

Auctions only accept collateral to increase backing. No new UST1 can be minted for distribution. The system is rebuilding its reserves.

**GREEN Tier: Normal Operations**

Full auction functionality. Arbitrageurs can buy UST1 with collateral or sell collateral for UST1 (redemption). This creates market pressure toward the $1 target.

**BLUE Tier: Expansion**

Overcollateralization enables new UST1 minting for ecosystem distribution. This is where the 5-year rolling pools are funded.

### Why These Specific Thresholds?

The tier thresholds (95%, 110%, 190%) are based on **historical crypto market drawdown analysis**.

**The 95% RED threshold:**
- Crypto bear markets have seen 80%+ drawdowns from peak
- Starting at 190% CR, an 80% drawdown would reach 38% CR
- But we don't reach peak CR before a crash—we're often at 150-170%
- 95% provides a buffer before undercollateralization becomes critical

**The 110% YELLOW threshold:**
- Provides 15% buffer above RED
- Ensures the system isn't constantly flipping between locked and unlocked states
- Gives markets time to stabilize

**The 190% BLUE threshold:**
- Set such that a typical bear market (50-70% drawdown) doesn't breach YELLOW
- Allows controlled expansion only when there's significant excess collateral
- Conservative approach prioritizes survival over growth

These are broad estimates subject to governance adjustment as real-world data accumulates.

---

## Treasury and Collateral Management

### Collateral Diversification Strategy

The treasury begins with USTC as the primary collateral, but the goal is **aggressive diversification** over time.

**Target portfolio evolution:**

| Phase | USTC % | Other Stables % | Blue-Chip Crypto % |
|-------|--------|-----------------|-------------------|
| Launch | 100% | 0% | 0% |
| Year 1 | 60% | 20% | 20% |
| Year 3 | 30% | 30% | 40% |
| Mature | <10% | 40% | 50% |

**Why diversify away from USTC?**

1. **Reduced single-point-of-failure risk**: USTC has its own market dynamics
2. **Better collateral quality**: BTC/ETH have deeper liquidity and broader acceptance
3. **Yield opportunities**: Some collateral can earn yield while backing UST1
4. **Regulatory resilience**: Diversification reduces jurisdiction-specific risks

### USTC as Foundation Collateral

Despite diversification goals, USTC has unique advantages as foundation collateral:

**Supply restrictions:**
- USTC supply growth has fallen to single digits
- Lower than USD inflation rate
- As long as chain demand stays stable, USTC should appreciate in USD terms

**Community alignment:**
- Using USTC ties the project to TerraClassic's success
- Creates symbiotic relationship with the ecosystem
- Absorbs "dead" USTC supply into productive use

**Bootstrapping advantage:**
- 16.7M USTC already deposited via preregistration
- Provides immediate collateral base without new capital requirements

### Long-Term Collateral Growth

**The key insight: properly selected collateral grows faster than USD-denominated liabilities.**

Research by Zhao et al. (2023) and Mert & Timur (2023) demonstrates:
- Bitcoin and similar assets benefit from M2 growth
- While fiat currencies lose value through inflation, crypto assets gain nominal value
- UST1's $1 liability erodes in real terms while collateral appreciates

**Historical precedent:**
- M2 money supply has grown in every 5-year period in modern history
- Even periods of monetary tightening (like 2022-2023) eventually reverse
- Long-term holders of quality assets outperform cash

This dynamic creates a **structural tailwind** for the system. Time is on our side.

---

## Auction Mechanism Design

### Why English Auctions?

The CMM uses **English auctions** (ascending price, highest bidder wins) rather than alternatives like Dutch auctions (descending price, first buyer wins).

**Advantages of English auctions:**

| Factor | English Auction | Dutch Auction |
|--------|-----------------|---------------|
| **Complexity** | Simple to understand | More complex timing decisions |
| **Participation** | Anyone can compete | Favors sophisticated actors |
| **Winner's Curse** | Mitigated—you only pay your bid | Severe—may overpay in excitement |
| **Price Discovery** | Gradual; participants learn from bids | Single moment decision |
| **Implementation** | Straightforward | Requires precise timing mechanics |

**The Winner's Curse Problem:**

In Dutch auctions, the first person to accept a price wins. This creates the "winner's curse"—you often win precisely because you overvalued the item. Over time, this drives away participants:

1. Participant wins auction
2. Realizes they overpaid relative to market
3. Becomes more conservative or stops participating
4. Fewer participants = less competitive auctions
5. Remaining participants form cartels

English auctions avoid this: you know exactly what others are willing to pay, and you only pay your actual bid.

### Preventing Cartelization

**In DeFi, there's no legal enforcement against cartels.** If three large players collude to suppress auction prices, there's no regulator to stop them. The economic design must make cartelization unprofitable.

**How English auctions + incentives prevent cartels:**

1. **Transparent competition**: All bids are visible, making coordination harder
2. **Frequent bidding rewards**: Even losing bidders earn incentives
3. **Early bidder bonus**: First bidder within 10% of final price gets 50% of incentives
4. **Low barrier to entry**: Non-experts can participate profitably
5. **Timer extensions**: 8-hour extensions per bid prevent sniping

**If a cartel tries to suppress prices:**
- Independent bidders can profit from the incentives alone
- Early honest bids earn the early bidder bonus
- Timer extensions give others time to compete
- Cartel members must outbid each other or accept lower returns

The goal is making honest participation more profitable than collusion.

### Bidding Incentives

**5% of each auction's UST1 is allocated to participation incentives:**

| Recipient | Share | Criteria |
|-----------|-------|----------|
| Early Bidder | 50% | First bid within 10% of final price |
| 1st Most Frequent | 25% | Most bids placed |
| 2nd Most Frequent | 10% | Second most bids |
| 3rd Most Frequent | 5% | Third most bids |
| 4th Most Frequent | 5% | Fourth most bids |
| 5th Most Frequent | 5% | Fifth most bids |

**Economic rationale:**

- **Early bidder bonus**: Rewards price discovery and market making
- **Frequency rewards**: Keeps auctions active and competitive
- **Distributed incentives**: Prevents single dominant player

This creates a **"fun" participation model** where non-experts can earn returns even without winning. It's gamification in service of market health.

---

## 5-Year Rolling Distribution Pools

### Economic Rationale

When UST1's collateralization ratio exceeds 190% (BLUE tier), new UST1 is minted and distributed across three pools:

1. **UST1 Staking Pool**: Rewards for UST1 stakers
2. **USTR Buy-and-Burn Pool**: Automatic market purchases and burns of USTR
3. **USTR Staking Pool**: Rewards for USTR stakers

**Why 5 years?**

The 5-year period is based on two historical observations:

1. **Bear market cycles**: Crypto bear markets typically last 1-3 years; 5 years provides margin
2. **M2 money supply**: Even during tightening periods, M2 has never contracted for 5+ consecutive years in modern history

By distributing over 5 years, the system:
- Smooths out volatility in reward rates
- Ensures reserves during bear markets
- Prevents boom-bust reward cycles that destabilize participation

### Counter-Cyclical Monetary Policy

Traditional central banks use counter-cyclical policy:
- **During booms**: Tighten money supply to prevent overheating
- **During busts**: Loosen money supply to stimulate recovery

The 5-year rolling pools achieve similar effects automatically:

**During bull markets (high CR):**
- More UST1 is minted
- Pools fill up
- Rewards increase gradually (not instantly)
- Prevents euphoric overleveraging

**During bear markets (lower CR):**
- No new UST1 minted below 190% CR
- But pools continue distributing accumulated UST1
- Provides steady rewards during market stress
- Encourages holding through the downturn

This **smooths the reward curve**, preventing the panic selling that occurs when yields suddenly collapse.

### Pool Mechanics

**Distribution rate calculation:**

```
Daily distribution = Pool balance / (5 years in days)
                   = Pool balance / 1,825
```

**Rolling nature:**

- New UST1 is added to pools when minted
- Distribution continues even if no new minting occurs
- Unused distributions carry forward
- CR drops below 190% pause new minting, not distribution of existing pool

**Governance adjustability:**

- Pool split ratios can be adjusted (e.g., 40% UST1 staking, 40% USTR buy-and-burn, 20% USTR staking)
- CR tier thresholds can be adjusted based on real-world data
- Distribution periods could be modified in extreme circumstances

---

## Monetary Policy Tools

### Open Market Operations

The CMM's primary policy tool is **open market operations**—the same mechanism central banks use, but transparent and on-chain.

**How it works:**

| CR Tier | Operations Allowed | Effect |
|---------|-------------------|--------|
| YELLOW | Buy collateral only | Increases CR |
| GREEN | Buy collateral + sell UST1 for collateral | Price pressure toward $1 |
| BLUE | Above + mint new UST1 | Controlled supply expansion |

**Comparison to traditional central banks:**

| Central Bank | CMM |
|--------------|-----|
| Buy/sell government bonds | Buy/sell collateral via auctions |
| Set interest rates | Staking pool yields |
| Reserve requirements | CR tier thresholds |

### Capital Controls

Capital controls in traditional economics mean restricting how money flows in and out of a country. For UST1, **partial capital controls** are implemented through:

1. **Auction-based supply changes**: Can't mint/redeem instantly at will
2. **Volume-based fees**: Higher fees during market stress
3. **CR tier restrictions**: Some operations locked at lower CRs

**Why this matters:**

Free, instant redemption at a fixed price creates bank run vulnerability. If anyone can exit at $1 instantly, everyone will try when confidence wavers.

By requiring auctions (with time delays and competitive bidding), UST1:
- Eliminates the "rush to the exit" dynamic
- Captures value for the treasury during high-volume periods
- Maintains orderly markets even during stress

### The Cantillon Effect

Named after Richard Cantillon, this effect describes how **money creation benefits those who receive it first**:

1. New money is created
2. First recipients spend it at current prices
3. Prices adjust upward as money spreads
4. Later recipients face higher prices

**In traditional finance:** Banks and connected institutions benefit first; ordinary citizens last.

**In USTR CMM:** Governance (eventually the community via CL8Y) decides who receives newly minted UST1:
- Stakers (UST1 and USTR)
- Market makers (via USTR buy-and-burn)
- Potentially ecosystem development, grants, etc.

This democratizes the Cantillon effect, directing the benefits of money creation to the community rather than privileged insiders.

---

## Risk Analysis and Mitigation

### Death Spiral Prevention

The #1 risk for any stablecoin-like system is the death spiral. USTR CMM prevents this through multiple mechanisms:

**1. Collateral backing**
- Every UST1 has real assets behind it
- Unlike USTC/LUNA, the backing doesn't rely on confidence alone

**2. No rigid peg**
- UST1 can trade at $0.90 without triggering crisis
- Market forces, not forced liquidations, correct the price

**3. RED tier lockout**
- If CR drops below 95%, everything stops
- No redemptions = no panic selling pressure
- System waits for market recovery

**4. Conservative CR thresholds**
- 190% before expansion
- 95% before lockout
- Significant buffer for market volatility

### Bear Market Survival

**Scenario: 70% crypto market crash**

Starting position:
- CR: 195%
- Collateral: $19.5M
- UST1 supply: 10M ($10M target value)

After 70% crash:
- Collateral value: $5.85M
- CR: 58.5%
- Tier: RED (locked)

**What happens:**
1. System locks all operations
2. No new UST1 can be created or redeemed
3. Collateral sits in treasury, untouched
4. Over 1-5 years, market recovers (historically guaranteed)
5. CR rises back above 95%
6. Operations resume

**Why this works:**

Bear markets caused by monetary tightening **always** reverse. M2 growth returns to normal. Asset prices recover. The only question is timing.

By locking the system rather than trying to "save" the peg through forced actions, USTR CMM simply waits out the storm.

### Black Swan Events

For events beyond normal bear markets:

**Scenario: USTC goes to near-zero**

Mitigation:
- Collateral diversification reduces USTC to <10% over time
- Other collateral (BTC, ETH, stables) maintains treasury value
- If caught early in diversification, this could be serious—hence the urgency to diversify

**Scenario: Smart contract vulnerability**

Mitigation:
- 100% test coverage
- External audit
- 7-day timelocks on governance changes
- Emergency pause capability
- Contracts are immutable (no upgrade attack vector)

**Scenario: Regulatory action**

Mitigation:
- Decentralized governance transition (CL8Y)
- Multi-jurisdictional community
- No single points of failure
- Collateral diversification across asset types

---

## Comparison with Other Systems

### Original USTC/LUNA: Lessons Learned

| USTC/LUNA | USTR CMM |
|-----------|----------|
| ❌ Zero collateral | ✅ Over-collateralized |
| ❌ Rigid peg | ✅ Flexible unstablecoin |
| ❌ Mint LUNA infinitely to defend peg | ✅ Lock system if undercollateralized |
| ❌ Death spiral possible | ✅ Death spiral prevented by design |
| ❌ Confidence-dependent | ✅ Collateral-backed |
| ❌ Fast collapse (days) | ✅ Slow recovery (years if needed) |

**Key lessons applied:**
1. **Never rely solely on confidence**—always have collateral
2. **Don't fight the market**—let prices adjust rather than forcing a peg
3. **Patience over panic**—lock and wait rather than desperate measures
4. **Time heals**—USD inflation makes recovery easier with time

**Why UST1's Design is Superior:**

The Terra collapse was not a bug: it was the inevitable outcome of an economic design that violated fundamental monetary principles. Lyons & Viswanath-Natraj (2019) demonstrated empirically that algorithmic stablecoins without collateral backing are "incapable of functioning as a reliable unit of account." Terra's design ignored this research, betting everything on confidence perpetually holding.

UST1 synthesizes this hard lesson with Fisher's (1933) debt-deflation theory: during crises, forced selling of assets to maintain a peg creates a deflationary spiral that destroys value faster than it can be recovered. Terra's mechanism of minting LUNA to absorb UST selling pressure was precisely this pathology—each LUNA mint diluted value, triggering more selling, triggering more minting.

UST1's RED tier lockout is the antithesis of this approach. Drawing on Taleb's (2012) antifragility framework, the system **stops trying to defend a peg during crises** and instead preserves collateral for recovery. This transforms what would be unbounded volatility (the death spiral) into bounded volatility (a temporary lockout followed by recovery).

The superiority is mathematical: Terra's mechanism had no equilibrium above zero during a confidence crisis. UST1's mechanism has a guaranteed equilibrium at whatever value the collateral eventually recovers to—and since Zhao et al. (2023) demonstrate that quality crypto assets appreciate with M2 money supply growth over multi-year periods, recovery is not just possible but historically inevitable.

### MakerDAO (DAI)

MakerDAO's DAI is a pioneering collateralized stablecoin. USTR CMM draws inspiration but differs:

| Aspect | DAI | UST1 |
|--------|-----|------|
| **Collateral type** | User-provided (CDPs) | Protocol-held treasury |
| **Liquidation risk** | Individual users can be liquidated | No individual liquidations |
| **Governance token** | MKR | CL8Y nodes (separate) |
| **Peg mechanism** | Stability fee adjustments | Auction-based supply + CR tiers |
| **Complexity** | High (CDPs, DSR, multiple modules) | Lower (single treasury) |

**What USTR CMM takes from DAI:**
- Collateralization as the foundation of stability
- Governance control over risk parameters
- Multiple collateral types

**What USTR CMM does differently:**
- No individual user liquidation risk
- Unstablecoin flexibility instead of rigid peg
- Time-based recovery instead of forced sales

**Why UST1's Design is Superior:**

DAI's CDP (Collateralized Debt Position) model, while groundbreaking, creates a structural fragility that UST1 avoids entirely. Kiyotaki & Moore's (1997) research on credit chains reveals the core problem: when individual users hold liquidation risk, a cascade can occur where one liquidation triggers margin calls that trigger more liquidations.

During the "Black Thursday" crash of March 2020, DAI experienced exactly this: ETH price drops triggered liquidations, but network congestion meant liquidation auctions failed, and some users lost their collateral for $0 bids. The individual-risk model meant that **the weakest participants bore the brunt of systemic stress**.

UST1's protocol-held treasury eliminates this cascade risk entirely. Drawing on Jeanne & Korinek's (2010) research on excessive capital flow volatility, UST1 implements what they call "Pigouvian" controls: the auction mechanism with fees and CR tiers acts as a dampener on capital flows rather than allowing free redemption that accelerates crises.

Furthermore, DAI's complexity (CDPs, DSR, multiple stability modules, liquidation mechanisms) creates attack surface and cognitive overhead. Gudgeon et al. (2020) modeled stochastic risks in non-custodial stablecoins and found that system complexity correlates with failure modes. UST1's single-treasury model with clear tier-based rules is simpler to audit, easier to understand, and has fewer vectors for exploitation.

UST1 takes DAI's proven insight that collateralization works, but removes the individual liquidation risk that makes DAI fragile during systemic stress. The protocol absorbs volatility collectively through CR tier changes rather than forcing individual users to absorb it through liquidations.

### Frax

Frax is a fractionally-algorithmic stablecoin that dynamically adjusts its collateral ratio.

| Aspect | Frax | UST1 |
|--------|------|------|
| **Collateral ratio** | Dynamic (80-100%+) | Fixed tiers (min 95%) |
| **Algorithmic portion** | Absorbs volatility | None—fully collateralized |
| **Governance token** | FXS | CL8Y nodes (separate) |
| **AMO modules** | Yes—algorithmic market operations | Auction-based only |

**What USTR CMM takes from Frax:**
- Protocol-controlled value (not user CDPs)
- Flexible approach to the $1 target
- Active treasury management

**What USTR CMM does differently:**
- Fully collateralized (no algorithmic portion)
- Simpler mechanism (auctions vs AMOs)
- CR tiers with automatic behavior changes

**Why UST1's Design is Superior:**

Frax's fractional-algorithmic model represents an attempt to find a middle ground between fully collateralized and purely algorithmic stablecoins. While more robust than Terra, it still carries the fundamental flaw that Grobys et al. (2021) identified in their stability analysis: any algorithmic component creates a confidence-dependent tail risk.

Frax's dynamic collateral ratio, which can drop to 80% or lower, means that during extreme stress, a portion of each FRAX token is backed only by the algorithmic mechanism. Gunay & Kaskaloglu (2024) demonstrated stablecoin "co-instability" where stress in one stablecoin propagates to others. An algorithmic component makes Frax a potential vector for this contagion.

UST1 takes Frax's innovative insight of protocol-controlled value (rather than user CDPs) but rejects the algorithmic portion entirely. The Mundell-Fleming trilemma (Mundell, 1963) teaches that you cannot have a fixed exchange rate, free capital flows, AND independent monetary policy simultaneously. Frax attempts to square this circle with algorithmic flexibility; UST1 honestly accepts the tradeoff by implementing partial capital controls through auctions.

Frax's AMO (Algorithmic Market Operations) modules are sophisticated but opaque: complex smart contract interactions that are difficult to audit and reason about. UST1's auction-based mechanism is transparent: bids are public, outcomes are deterministic, and the CR tier system creates clear, predictable behavioral changes at known thresholds.

The synthesis: UST1 takes Frax's protocol-controlled treasury concept but removes the algorithmic tail risk that could cause confidence collapse during extreme market events. By accepting full collateralization as a constraint, UST1 trades Frax's capital efficiency for genuine bounded volatility risk.

### Liquity (LUSD)

Liquity's LUSD is a governance-minimized stablecoin with hard peg guarantees.

| Aspect | LUSD | UST1 |
|--------|------|------|
| **Collateral** | ETH only | Diversified basket |
| **Governance** | Immutable | CL8Y-adjustable parameters |
| **Redemption** | Instant at $1 | Auction-based, not guaranteed |
| **Minimum CR** | 110% | 95% (RED threshold) |
| **Recovery mode** | Global liquidations | System lockout |

**What USTR CMM takes from Liquity:**
- Simple, understandable mechanics
- Focus on long-term stability
- Minimum intervention approach

**What USTR CMM does differently:**
- Diversified collateral (not ETH only)
- Governance flexibility for parameters
- Unstablecoin approach vs hard peg
- Lockout vs liquidation during stress

**Why UST1's Design is Superior:**

Liquity represents perhaps the most elegant stablecoin design in DeFi—governance-minimized, simple, and focused. UST1 learns deeply from Liquity's philosophy but addresses two critical limitations: single-asset collateral risk and the liquidation cascade problem.

Liquity's ETH-only collateral creates concentration risk that Adalid & Detken (2007) identified in their research on liquidity shocks and asset price cycles. When a single asset class dominates collateral, the system's fate becomes coupled entirely to that asset's performance. During the 2022 bear market, LUSD's backing was entirely exposed to ETH's 80%+ drawdown. UST1's diversified basket (targeting <10% USTC, 40% stables, 50% blue-chip crypto at maturity) distributes this risk across uncorrelated assets.

Liquity's "Recovery Mode" triggers global liquidations when system CR drops below 150%. While this maintains solvency, Fisher's (1933) debt-deflation theory warns that forced asset sales during market stress depress prices further, creating a feedback loop. UST1's lockout mechanism is philosophically opposite: rather than forcing sales at the worst possible time, it preserves collateral value by simply waiting.

Brunnermeier & Schnabel's (2015) historical analysis of bubbles and central bank responses supports this approach: the most damaging policy during crises is forced selling that amplifies panic. The most effective approach is often to simply stop—pause operations, preserve capital, and wait for markets to normalize.

Liquity's immutable governance is both a strength (no attack vector through governance capture) and a weakness (no adaptation to changing market conditions). UST1 takes a middle path: parameters like CR thresholds are adjustable through CL8Y governance, but core mechanics (auction structure, tier behavior) are immutable. This allows learning from real-world data while preventing capture.

The synthesis: UST1 takes Liquity's elegant simplicity and minimum-intervention philosophy, but adds diversified collateral for resilience and replaces forced liquidations with patient lockouts. The result is a system that can survive multi-year bear markets without the forced selling that deepens crises.

### Synthesis: The Combined Design Advantage

UST1's superiority over each predecessor is not merely incremental—it represents a fundamental synthesis of lessons learned across the entire history of stablecoin design:

| System | Key Lesson | UST1 Integration |
|--------|------------|------------------|
| Terra/LUNA | Collateral is non-negotiable | Full collateralization, no algorithmic shortcuts |
| MakerDAO | Individual liquidations create cascade risk | Protocol-held treasury, collective risk absorption |
| Frax | Protocol-controlled value works | Treasury model adopted, algorithmic portion rejected |
| Liquity | Simplicity and patience win | Simple tier system, lockout over liquidation |

The research synthesis is equally important:

- **Lyons & Viswanath-Natraj (2019)**: Algorithmic stablecoins fail as units of account → UST1 is fully collateralized
- **Kiyotaki & Moore (1997)**: Credit chains propagate individual failures → UST1 has no individual positions
- **Jeanne & Korinek (2010)**: Capital controls dampen volatility → UST1 uses auction-based controls
- **Fisher (1933)**: Forced selling deepens crises → UST1 locks rather than liquidates
- **Taleb (2012)**: Systems should gain from stress → UST1's antifragile design
- **Zhao et al. (2023)**: Quality assets appreciate with M2 → UST1's time-based recovery guarantee

No prior system has combined all of these insights. Each learned some lessons but repeated others' mistakes. UST1 stands on the shoulders of these predecessors, synthesizing their hard-won wisdom into a design that addresses every identified failure mode while preserving each system's genuine innovations.

---

## The Philosophy: Denationalization of Currency

The USTR CMM project is part of a broader movement toward **denationalized currency**—money controlled by communities rather than governments.

### Historical Context

| Thinker | Contribution |
|---------|--------------|
| **W. Dai (1998)** | "b-money" concept: decentralized monetary system with treasury and open market trades |
| **Hayek (1978)** | Critique of government money; advocacy for private, competitive currencies |
| **Cantillon & Hume** | Analysis of how money creation benefits are distributed |
| **Marx (1844)** | Money as an amplifier of power; state control distorts equity |

### Why Denationalization Matters

Government-controlled currencies suffer from:

1. **Inflation bias**: Governments have incentive to inflate away debts
2. **Political manipulation**: Monetary policy serves political goals
3. **Cantillon inequality**: Benefits flow to connected insiders first
4. **Lack of competition**: No market pressure for better money

Community-controlled currencies offer:

1. **Transparent rules**: All parameters are on-chain and auditable
2. **Community-aligned incentives**: Token holders benefit from sound policy
3. **Democratic Cantillon effect**: New money goes to the community
4. **Competitive pressure**: Must actually work to maintain adoption

### The Vision

USTR CMM aims to create a **unit of account that serves the TerraClassic community** rather than external interests. The goal isn't just price stability—it's economic sovereignty.

---

## Governance Economics

Governance for USTR CMM will be managed through **CL8Y nodes**—an NFT-based governance system separate from the USTR and UST1 tokens.

**Why separate governance?**

- USTR is designed to be burned to zero—bad for governance token
- UST1 should be stable—governance speculation would destabilize it
- NFT-based governance ties voting to committed participants, not speculators

**For detailed information about CL8Y governance, node acquisition, and the community:**

Visit **[CL8Y.com](https://cl8y.com)**

The CL8Y community supports the TerraClassic ecosystem and is building the governance infrastructure for USTR CMM. Governance specifics—including node distribution, voting weights, and quorum requirements—are managed by that community.

---

## Summary: Why This Design Works

USTR CMM succeeds where others failed by applying sound economic principles:

| Principle | Implementation |
|-----------|----------------|
| **Collateralization** | Every UST1 backed by treasury assets |
| **Flexibility** | Unstablecoin targets $1 without rigid peg |
| **Bounded volatility** | No rigid peg means no catastrophic peg-break events |
| **Antifragility** | System gains strength from stress |
| **Time arbitrage** | USD inflation guarantees long-term collateral growth |
| **Death spiral prevention** | RED tier locks system during crises |
| **Anti-cartel design** | Auction incentives prevent collusion |
| **Counter-cyclical policy** | 5-year pools smooth boom-bust cycles |
| **Community alignment** | CL8Y governance, USTC collateral, TerraClassic focus |

**The core insight:**

Traditional stablecoins try to fight market forces. USTR CMM works *with* market forces:
- Let prices fluctuate (within reason)
- Let time work in our favor (inflation)
- Let patience be rewarded (lockouts during crashes)
- Let participation be profitable (auction incentives)

This creates a system that doesn't just survive—it gets stronger over time.

---

## Bibliography

### Primary References

Adalid, R., & Detken, C. (2007). Liquidity Shocks and Asset Price Boom/Bust Cycles. *SSRN Electronic Journal*. https://doi.org/10.2139/ssrn.963147

Ante, L., Fiedler, I., & Strehle, E. (2020). The influence of stablecoin issuances on cryptocurrency markets. *Finance Research Letters*, 41, 101867. https://doi.org/10.1016/j.frl.2020.101867

Barro, R. J. (1983). Inflationary Finance under Discretion and Rules. *The Canadian Journal of Economics*, 16(1), 1. https://doi.org/10.2307/134971

Bohn, H. (1988). Why do we have nominal government debt? *Journal of Monetary Economics*, 21(1), 127–140. https://doi.org/10.1016/0304-3932(88)90050-5

Brunnermeier, M. K., & Schnabel, I. (2015). Bubbles and Central Banks: Historical Perspectives. *SSRN*. https://ssrn.com/abstract=2592370

Calvo, G. A. (1978). Optimal seigniorage from money creation. *Journal of Monetary Economics*, 4(3), 503–517. https://doi.org/10.1016/0304-3932(78)90044-2

Cantillon, R., & Higgs, H. (1964). *Essai sur la nature du commerce en général*. A.M. Kelley.

Cheng, W., & Angus, S. D. (2012). The Cantillon Effect of Money Injection through Deficit Spending. *RePEc: Research Papers in Economics*.

Dai, W. (1998). B-money. http://www.weidai.com/bmoney.txt

Doepke, M., & Schneider, M. (2017). Money as a Unit of Account. *Econometrica*, 85(5), 1537–1574. https://doi.org/10.3982/ecta11963

Fischer, S. (1977). Long-Term Contracts, Rational Expectations, and the Optimal Money Supply Rule. *Journal of Political Economy*, 85(1), 191–205. https://doi.org/10.1086/260551

Fisher, I. (1933). The Debt-Deflation Theory of Great Depressions. *Econometrica*, 1(4), 337. https://doi.org/10.2307/1907327

Galbraith, J. K. (1993). *A short history of financial euphoria*. Whittle Books in association with Penguin Books.

Goldberg, D. (2010). The tax-foundation theory of fiat money. *Economic Theory*, 50(2), 489–497. https://doi.org/10.1007/s00199-010-0564-8

Grobys, K., Junttila, J.-P., Kolari, J. W., & Sapkota, N. (2021). On the Stability of Stablecoins. *SSRN Electronic Journal*. https://doi.org/10.2139/ssrn.3764457

Gudgeon, L., Perez, D., Harz, D., Livshits, B., & Gervais, A. (2020). While Stability Lasts: A Stochastic Model of Non-Custodial Stablecoins. *arXiv preprint*. https://arxiv.org/abs/2004.01304

Gunay, S., & Kaskaloglu, K. (2024). Break a Peg! A Study of Stablecoin Co-Instability. *International Review of Financial Analysis*, 94, 103404. https://doi.org/10.1016/j.irfa.2024.103404

Hayek, F. (1978). *Denationalisation of money: the theory and practice of concurrent currencies*. Institute of Economic Affairs.

Hirota, S. (2023). Money supply, opinion dispersion, and stock prices. *Journal of Economic Behavior & Organization*, 212, 1286–1310. https://doi.org/10.1016/j.jebo.2023.06.014

Hume, D. (1788). *Essays, moral, political, and literary*.

Jeanne, O., & Korinek, A. (2010). Excessive Volatility in Capital Flows: A Pigouvian Taxation Approach. *SSRN Electronic Journal*. https://doi.org/10.2139/ssrn.1604013

Johnson, H. G. (1963). A Survey of Theories of Inflation. *Indian Economic Review*, 6(3), 29–69. http://www.jstor.org/stable/42657300

Kiyotaki, N., & Moore, J. (1997). Credit Chains. *Edinburgh School of Economics Discussion Paper Series*, 188.

Lyons, R. K., & Viswanath-Natraj, G. (2019). What Keeps Stable Coins Stable? *SSRN Electronic Journal*. https://doi.org/10.2139/ssrn.3508006

Marx, K. (1844). *The Power of Money*.

Mert, N., & Timur, M. (2023). Bitcoin and money supply relationship: An analysis of selected country economies. *Quantitative Finance and Economics*, 7(2), 229–248. https://doi.org/10.3934/qfe.2023012

Mundell, R. A. (1963). Capital Mobility and Stabilization Policy under Fixed and Flexible Exchange Rates. *The Canadian Journal of Economics and Political Science*, 29(4), 475–485. https://doi.org/10.2307/139336

Smith, A. (1776). *The Wealth of Nations*. W. Strahan and T. Cadell, London.

Taleb, N. N. (2012). *Antifragile: how to live in a world we don't understand*. Random House.

Terra Classic Docs. (2024). Terra Classic Documentation. https://classic-docs.terra.money/index.html

Zhao, Y., Zhang, M., Pei, Z., & Nan, J. (2023). The effects of quantitative easing on Bitcoin prices. *Finance Research Letters*, 57, 104232. https://doi.org/10.1016/j.frl.2023.104232

---

*This document provides the economic foundation for USTR CMM. For technical implementation details, see [CONTRACTS.md](./CONTRACTS.md) and [ARCHITECTURE.md](./ARCHITECTURE.md). For deployment procedures, see [DEPLOYMENT.md](./DEPLOYMENT.md).*

