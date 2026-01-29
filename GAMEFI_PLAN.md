# TerraClassic GameFi Proposal: PROTOCASS — Skill-Based Text RPG Platform

## Executive Summary

A **skill-based text RPG platform** for TerraClassic that enables creators to build and players to experience custom text-based adventures. The system uses a **Web 2.5 architecture** with a verifiable immutable database (ImmuneDB) for game state and CosmWasm smart contracts exclusively for UST1 vault operations. All gameplay is **deterministic and skill-based** (zero randomness), prioritizing **exploration, asset acquisition, and combat** in that order.

> **Important**: This platform burns **UST1** (CW20 token) as its primary economic mechanism. All game fees are permanently burned, creating deflationary pressure proportional to player engagement.

### Key Differentiators

- **Zero Gas Gameplay**: All game actions execute in ImmuneDB; blockchain only for deposits/withdrawals
- **Skill-Based Only**: No RNG—all outcomes determined by player knowledge, strategy, and pattern recognition
- **LLM-Native Content**: Game worlds, narratives, NPCs, and quests are primarily LLM-generated
- **Verifiable State**: ImmuneDB provides Merkle proofs for all state transitions, publicly auditable
- **Exploration-First Design**: Discovery mechanics take priority over combat
- **UST1 Burn Economics**: All platform fees are burned, not redistributed

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Architecture Overview](#2-architecture-overview)
3. [ImmuneDB: Verifiable Game State](#3-immunedb-verifiable-game-state)
4. [Skill-Based Gameplay Systems](#4-skill-based-gameplay-systems)
5. [Core Gameplay Loop](#5-core-gameplay-loop)
6. [LLM Content Generation](#6-llm-content-generation)
7. [Economic Model & UST1 Burns](#7-economic-model--ust1-burns)
8. [Smart Contract Design](#8-smart-contract-design)
9. [Asset System (NFTs)](#9-asset-system-nfts)
10. [World & Zone Architecture](#10-world--zone-architecture)
11. [Creator Economy](#11-creator-economy)
12. [Frontend Architecture](#12-frontend-architecture)
13. [Security Considerations](#13-security-considerations)
14. [Implementation Phases](#14-implementation-phases)
15. [Risk Analysis](#15-risk-analysis)

---

## 1. Design Philosophy

### 1.1 Psychological Foundations

GameFi players engage most deeply with systems that satisfy core psychological needs. This platform is designed around empirically-validated motivational triggers, ordered by player preference data:

| Priority | Motivation | Psychological Basis | Platform Implementation |
|----------|------------|---------------------|------------------------|
| **1st** | **Exploration** | Curiosity/novelty-seeking; dopamine release from discovery; the "what's around the corner" effect | Procedural worlds, hidden lore, secret paths, unmapped territories |
| **2nd** | **Asset Acquisition** | Endowment effect (ownership increases perceived value); loss aversion; status signaling; completionism | Collectible items, rare discoveries, visible inventories, trading |
| **3rd** | **Combat** | Competence/mastery needs; self-efficacy; skill expression; social comparison | Pattern-based encounters, leaderboards, skill progression |

### 1.2 Why These Priorities?

**Exploration First**: Discovery triggers anticipatory dopamine—the same neurological pathway as gambling rewards, but without requiring RNG. Players who explore are intrinsically motivated; they don't need token incentives to engage. This creates "stickier" users who return because the world is interesting, not because of yield farming.

**Assets Second**: The endowment effect means players value items they own more than identical items they don't. Combined with visible inventories and trading, this creates organic social dynamics and status hierarchies without explicit competition.

**Combat Third**: While combat provides skill expression, it's the weakest long-term retention driver because it requires continuous effort. Combat-focused games have higher churn. By making combat optional and skill-gated, we attract players who genuinely want to master the system.

### 1.3 Why Skill-Based (No RNG)?

| RNG-Based | Skill-Based |
|-----------|-------------|
| Perceived as gambling; regulatory risk | Clear skill expression; no gambling classification |
| Frustrating losses feel unfair | Losses are learning opportunities |
| Whale advantages via rerolls | Skill is the great equalizer |
| Short dopamine hits, fast burnout | Sustainable mastery progression |
| Content must be consumed quickly | Content has replay value for mastery |

**Skill-based design creates sustainable engagement** because players attribute outcomes to their own abilities, creating intrinsic motivation loops.

### 1.4 Why LLM-Generated Content?

Traditional game development requires:
- Artists for visuals
- Writers for narrative
- Designers for encounters
- Programmers for systems

Text-based games with LLM generation require only:
- **System designers** (define rules, not content)
- **Prompt engineers** (define style, not instances)

This reduces content creation cost by ~90% while enabling:
- Infinite variety (no two playthroughs identical)
- Rapid iteration (change prompts, not assets)
- Player-generated worlds (creators write prompts, not code)

---

## 2. Architecture Overview

### 2.1 High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React/Next.js)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Game      │  │  Inventory  │  │   World     │  │   Creator           │ │
│  │   Terminal  │  │   & Assets  │  │   Map       │  │   Studio            │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                        WebSocket Connection (Real-time Game State)           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GAME ENGINE (Node.js/Rust)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Command    │  │   State     │  │   Combat    │  │   LLM               │ │
│  │  Parser     │  │   Machine   │  │   Resolver  │  │   Narrator          │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                      │                                       │
│                         ┌────────────┴────────────┐                         │
│                         ▼                         ▼                         │
│                  ┌─────────────┐          ┌─────────────┐                   │
│                  │  ImmuneDB   │          │    Redis    │                   │
│                  │  (Primary   │          │  (Session   │                   │
│                  │   State)    │          │   Cache)    │                   │
│                  └─────────────┘          └─────────────┘                   │
│                         │                                                    │
│                         ▼                                                    │
│                  ┌─────────────────────────────────────────┐                │
│                  │         MERKLE PROOF PUBLISHER          │                │
│                  │   (Periodic state root to blockchain)   │                │
│                  └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TERRACLASSIC BLOCKCHAIN                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         VAULT CONTRACT                                │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │  Deposit UST1 │ Withdraw UST1 │ Burn Registry │ State Root     │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│         │                              │                                     │
│  ┌──────┴──────┐                ┌──────┴──────┐                             │
│  │   NFT       │                │   Creator   │                             │
│  │   Registry  │                │   Registry  │                             │
│  └─────────────┘                └─────────────┘                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Game State | ImmuneDB (immudb) | Immutable, verifiable, atomic transactions |
| Smart Contracts | CosmWasm (Rust) | Native TerraClassic, CW20/CW721 support |
| Game Engine | Node.js + TypeScript | Rapid development, LLM integration |
| LLM Layer | GPT-4o-mini / Claude Haiku | Cost-effective, fast inference |
| Session Cache | Redis | Real-time state, pub/sub for multiplayer |
| Frontend | Next.js 14+ / React | SSR, WebSocket, responsive |
| State Proofs | Custom Merkle Publisher | Periodic on-chain anchoring |

### 2.3 Data Flow: Action → State → Proof

```
Player Action          Game Engine           ImmuneDB              Blockchain
     │                      │                    │                      │
     │ ─── "go north" ────► │                    │                      │
     │                      │                    │                      │
     │                      │ ── ValidateAction ─┼─► │                  │
     │                      │    (atomic tx)     │   │                  │
     │                      │                    │   │                  │
     │                      │ ◄─ NewState + ─────┼── │                  │
     │                      │    TxProof         │                      │
     │                      │                    │                      │
     │                      │ ── GenerateNarrative (LLM)                │
     │                      │                    │                      │
     │ ◄── "You enter a ────│                    │                      │
     │     dark corridor..."│                    │                      │
     │                      │                    │                      │
     │                      │    [Every N minutes]                      │
     │                      │ ───────────────────┼──► PublishStateRoot  │
     │                      │                    │         │            │
```

---

## 3. ImmuneDB: Verifiable Game State

### 3.1 What is ImmuneDB?

ImmuneDB refers to an **immutable database** (such as immudb) that provides:

| Feature | Description |
|---------|-------------|
| **Immutability** | Records can only be appended, never modified or deleted |
| **Cryptographic Verification** | SHA-256 hashing with Merkle tree structure |
| **Atomic Transactions** | ACID-compliant operations for complex state changes |
| **Audit Trail** | Complete history of all state transitions |
| **Proof Generation** | Merkle proofs for any value at any point in time |

### 3.2 Why Not Fully On-Chain?

| Aspect | Fully On-Chain | ImmuneDB + Anchoring |
|--------|----------------|---------------------|
| **Cost per action** | ~0.01-0.1 UST1 gas | $0 (database operation) |
| **Latency** | 3-6 seconds (block time) | <50ms |
| **Actions per day** | Limited by gas budget | Unlimited |
| **Verifiability** | Full | Periodic anchoring + proofs |
| **Complexity** | Smart contract logic | Standard application code |

**Conclusion**: ImmuneDB provides 99% of blockchain benefits at 0.1% of the cost, with periodic on-chain anchoring for dispute resolution.

### 3.3 State Anchoring Mechanism

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATE ANCHORING FLOW                                 │
│                                                                              │
│   ImmuneDB                     Anchor Service              Blockchain        │
│       │                             │                           │           │
│       │ ─── Current State ────────► │                           │           │
│       │     (every 10 min)          │                           │           │
│       │                             │                           │           │
│       │                             │ ── ComputeMerkleRoot ───► │           │
│       │                             │                           │           │
│       │                             │ ── PublishRoot ─────────► │           │
│       │                             │    (batch tx)             │           │
│       │                             │                           │           │
│   [Dispute]                         │                           │           │
│       │                             │                           │           │
│       │ ─── GenerateProof ────────► │                           │           │
│       │     (specific value)        │                           │           │
│       │                             │ ── VerifyProof ─────────► │           │
│       │                             │    (against root)         │           │
│       │                             │                           │           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Dispute Resolution

If a player disputes their game state:

1. **Player requests proof** for specific state (e.g., "I had 500 credits at block X")
2. **ImmuneDB generates Merkle proof** linking value to anchored root
3. **On-chain verification** confirms or denies the claim
4. **Resolution**: Provably correct state wins; no he-said/she-said

**Development Time**: 2-3 weeks for anchoring service + verification contract

---

## 4. Skill-Based Gameplay Systems

### 4.1 Core Principle: Deterministic Outcomes

Every game action must have a **predictable, learnable** outcome. Players who understand the system should be able to achieve consistent results.

### 4.2 Skill Mechanics Taxonomy

| Mechanic Type | Description | Example | Psychological Hook |
|---------------|-------------|---------|-------------------|
| **Pattern Recognition** | Enemies/puzzles have tells that predict behavior | Enemy "charges up" before attack; player must dodge | Mastery, learning |
| **Resource Optimization** | Limited resources must be allocated strategically | 10 actions per dungeon; choose wisely | Planning, efficiency |
| **Knowledge Tests** | Outcomes depend on player knowledge of lore/mechanics | "The inscription reads TIMOR. What is the fear god's name?" | Exploration reward |
| **Sequence Puzzles** | Execute actions in correct order | Activate runes in order matching constellation | Pattern learning |
| **Deduction** | Gather clues to solve mysteries | NPC testimonies contradict; find the liar | Detective satisfaction |
| **Strategic Positioning** | Turn-based tactics with full information | Move through grid avoiding visible hazards | Chess-like mastery |
| **Memory Challenges** | Recall information from earlier in session | "What did the merchant say about the eastern gate?" | Attention reward |

### 4.3 Combat Resolution (No RNG)

Traditional RPG combat uses dice rolls. PROTOCASS uses **pattern-based resolution**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMBAT RESOLUTION SYSTEM                             │
│                                                                              │
│   ENEMY PATTERN (Known after observation):                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Round 1: DEFEND → Round 2: ATTACK → Round 3: CHARGE → Round 4: HEAVY  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   PLAYER ACTIONS (Choose one per round):                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  ATTACK: Deals damage if enemy not DEFENDING                        │   │
│   │  DEFEND: Blocks enemy ATTACK (not HEAVY)                            │   │
│   │  DODGE:  Avoids enemy HEAVY attack                                  │   │
│   │  STRIKE: Bonus damage during enemy CHARGE (vulnerable)              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   OPTIMAL PLAY (100% deterministic):                                        │
│   Round 1: ATTACK (enemy defending, no damage)                              │
│   Round 2: DEFEND (block enemy attack)                                      │
│   Round 3: STRIKE (enemy charging, bonus damage!)                           │
│   Round 4: DODGE  (avoid heavy attack)                                      │
│   Repeat pattern...                                                         │
│                                                                              │
│   SKILL EXPRESSION: Learning enemy patterns, optimal response sequences     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Exploration Mechanics (Primary Loop)

Since exploration is the #1 priority, it receives the most design attention:

| Mechanic | Description | Skill Element |
|----------|-------------|---------------|
| **Fog of War** | Unmapped areas revealed through movement | Spatial memory, route optimization |
| **Hidden Paths** | Secret passages found via environmental clues | Attention to detail, lore knowledge |
| **Environmental Puzzles** | Obstacles requiring item/action combinations | Inventory management, logic |
| **Lore Fragments** | Scattered texts that combine into revelations | Collection, synthesis |
| **NPC Networks** | Characters reference each other; graph traversal | Social deduction, note-taking |
| **Time-Gated Areas** | Zones only accessible at certain conditions | Planning, patience |

### 4.5 Difficulty Scaling

Rather than RNG difficulty, use **information asymmetry**:

| Difficulty | Information Available |
|------------|----------------------|
| **Easy** | Enemy patterns shown explicitly before combat |
| **Medium** | Patterns revealed after 1 observation round |
| **Hard** | Patterns must be deduced from subtle tells |
| **Expert** | Patterns change mid-combat on player mistakes |

**Development Time**: 3-4 weeks for core skill systems

---

## 5. Core Gameplay Loop

### 5.1 Session Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORE GAMEPLAY LOOP                                   │
│                                                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                                                                         │ │
│   │    ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐ │ │
│   │    │ EXPLORE  │ ───► │ DISCOVER │ ───► │ ACQUIRE  │ ───► │  MASTER  │ │ │
│   │    │          │      │          │      │          │      │          │ │ │
│   │    │ Navigate │      │ Find     │      │ Collect  │      │ Combat/  │ │ │
│   │    │ world    │      │ secrets  │      │ items    │      │ Puzzles  │ │ │
│   │    └──────────┘      └──────────┘      └──────────┘      └──────────┘ │ │
│   │         ▲                                                      │       │ │
│   │         └──────────────────────────────────────────────────────┘       │ │
│   │                         (New areas unlock)                              │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│   TIME INVESTMENT:                                                          │
│   • Exploration: ~50% of playtime                                           │
│   • Asset Management: ~30% of playtime                                      │
│   • Combat/Puzzles: ~20% of playtime                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Action Types

| Action | Energy Cost | Outcome | Skill Factor |
|--------|-------------|---------|--------------|
| `MOVE [direction]` | 1 | Change location | Route optimization |
| `EXAMINE [object]` | 0 | Get description + clues | Attention, memory |
| `TAKE [item]` | 1 | Add to inventory | Inventory management |
| `USE [item] ON [target]` | 2 | Context-dependent | Puzzle solving |
| `TALK [npc]` | 1 | Dialogue + info | Social deduction |
| `ATTACK [target]` | 3 | Enter combat | Pattern recognition |
| `SOLVE [puzzle]` | 5 | Attempt puzzle | Logic, knowledge |
| `REST` | 0 | Restore energy (real-time) | Time management |

### 5.3 Energy System

**Energy regenerates in real-time** (not via payment):

| Tier | Max Energy | Regen Rate | Unlock Condition |
|------|------------|------------|------------------|
| Base | 50 | 1 per 2 min | Default |
| Explorer | 75 | 1 per 90 sec | Discover 10 zones |
| Veteran | 100 | 1 per 60 sec | Complete 5 dungeons |
| Master | 150 | 1 per 45 sec | 100+ hours played |

**Why not sell energy?** Selling energy creates pay-to-win dynamics and regulatory risk. Time-gated energy with skill-based progression rewards engagement, not spending.

### 5.4 Progression Systems

| System | Description | Burn Mechanism |
|--------|-------------|----------------|
| **Character Level** | Unlocks new areas, actions | Free (engagement reward) |
| **Skill Mastery** | Improved effectiveness in combat/puzzles | Free (practice) |
| **Equipment** | Items with stat bonuses | Crafting burns UST1 |
| **Achievements** | Badges for accomplishments | Display NFT costs UST1 |
| **Reputation** | NPC relationship levels | Quest completion (free) |

**Development Time**: 2-3 weeks for core loop implementation

---

## 6. LLM Content Generation

### 6.1 Generation Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LLM CONTENT PIPELINE                                 │
│                                                                              │
│   STATIC SEED DATA                    DYNAMIC GENERATION                     │
│   (Creator-defined)                   (LLM at runtime)                       │
│                                                                              │
│   ┌─────────────────┐                 ┌─────────────────┐                   │
│   │ World Template  │ ──────────────► │ Zone Descriptions│                  │
│   │ • Theme         │                 │ (on first visit) │                  │
│   │ • Tone          │                 └─────────────────┘                   │
│   │ • Key lore      │                                                        │
│   └─────────────────┘                 ┌─────────────────┐                   │
│                                       │ NPC Dialogue    │                   │
│   ┌─────────────────┐                 │ (contextual)    │                   │
│   │ NPC Templates   │ ──────────────► └─────────────────┘                   │
│   │ • Personality   │                                                        │
│   │ • Knowledge     │                 ┌─────────────────┐                   │
│   │ • Goals         │                 │ Combat Narration│                   │
│   └─────────────────┘                 │ (per action)    │                   │
│                                       └─────────────────┘                   │
│   ┌─────────────────┐                                                        │
│   │ Item Templates  │                 ┌─────────────────┐                   │
│   │ • Type          │ ──────────────► │ Item Descriptions│                  │
│   │ • Rarity tier   │                 │ (on discovery)  │                   │
│   │ • Theme hooks   │                 └─────────────────┘                   │
│   └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 What LLMs Generate vs. What They Don't

| LLM Generates | System Defines (Not LLM) |
|---------------|-------------------------|
| Prose descriptions | Stat values |
| NPC dialogue | Item effects |
| Combat narration | Combat resolution |
| Lore and backstory | Puzzle solutions |
| Quest flavor text | Zone connectivity |
| Atmospheric details | Energy costs |

**Critical**: LLMs **never** determine mechanical outcomes. They only describe what the deterministic system has already decided.

### 6.3 Prompt Templates (Examples)

**Zone Description**:
```
You are the narrator for a {theme} text adventure. The player has entered a new area.

World context: {world_lore}
Zone type: {zone_type}
Connected to: {adjacent_zones}
Contains: {items}, {npcs}, {hazards}

Write 2-3 sentences describing this location. Be atmospheric and hint at 
interactive elements without listing them explicitly. Match the tone: {tone}.
```

**Combat Narration**:
```
The player executed {action} against {enemy}. 
Result: {mechanical_outcome}
Damage dealt: {damage}
Enemy state: {enemy_hp}/{enemy_max_hp}

Narrate this combat exchange in 1-2 vivid sentences. 
Style: {combat_style}
Do not reveal enemy patterns or strategy.
```

### 6.4 Generation Costs

| Content Type | Generation Frequency | Est. Cost per Player/Day |
|--------------|---------------------|-------------------------|
| Zone descriptions | Once per new zone | ~$0.001 |
| NPC dialogue | Per conversation | ~$0.003 |
| Combat narration | Per combat round | ~$0.0005 |
| Item descriptions | Per discovery | ~$0.0008 |
| **Total active player** | ~100 generations | ~$0.05/day |

At scale (10,000 DAU), LLM costs ~$500/day, covered by platform burns.

### 6.5 Caching Strategy

- **Zone descriptions**: Cache after first generation (content-addressed)
- **NPC base dialogue**: Cache per conversation topic
- **Combat narration**: Generate fresh (variety important)
- **Item descriptions**: Cache per item type + rarity

**Development Time**: 2-3 weeks for LLM integration + prompt engineering

---

## 7. Economic Model & UST1 Burns

### 7.1 Core Economic Principle

**All platform fees are burned, not redistributed.**

This differs from most GameFi projects that create yield from thin air. PROTOCASS is deflationary by design—value extraction requires value destruction.

### 7.2 Burn Sources

| Burn Event | Amount | Trigger | Psychological Justification |
|------------|--------|---------|---------------------------|
| **Premium Zone Entry** | 5-50 UST1 | Entering gated content | Scarcity creates perceived value |
| **Item Crafting** | 1-100 UST1 | Combining items | Sunk cost commitment |
| **NFT Minting** | 10-500 UST1 | Making item tradeable | Status/permanence premium |
| **Character Slot** | 25 UST1 | Creating additional character | Identity investment |
| **World Creation** | 100 UST1 | Publishing custom world | Creator commitment |
| **Name Reservation** | 5 UST1 | Unique character name | Personalization value |

### 7.3 What We Don't Charge For

| Free Action | Reason |
|-------------|--------|
| Basic exploration | Core loop must be frictionless |
| Combat | Skill expression shouldn't have fee anxiety |
| Chatting/Social | Community is a public good |
| Leveling up | Progression rewards engagement |
| Basic inventory | Pay-to-store is hostile |

### 7.4 Economic Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ECONOMIC FLOW                                        │
│                                                                              │
│   PLAYER                                                                     │
│     │                                                                        │
│     │ ─── Deposit UST1 ───────────────────────────────────────────────────► │
│     │                                                                   VAULT│
│     │ ◄── Credits (1:1) ───────────────────────────────────────────────────│ │
│     │                                                                        │
│     │                         GAMEPLAY                                       │
│     │                             │                                          │
│     │     ┌───────────────────────┼───────────────────────┐                 │
│     │     ▼                       ▼                       ▼                 │
│     │ ┌────────┐            ┌────────┐            ┌────────┐               │
│     │ │ Free   │            │ Burns  │            │ Trades │               │
│     │ │ Actions│            │        │            │        │               │
│     │ │        │            │ -UST1  │            │ P2P    │               │
│     │ └────────┘            └────────┘            └────────┘               │
│     │                             │                                          │
│     │                             ▼                                          │
│     │                    ┌──────────────┐                                   │
│     │                    │ BURNED       │                                   │
│     │                    │ (Supply ↓)   │                                   │
│     │                    └──────────────┘                                   │
│     │                                                                        │
│     │ ─── Withdraw Request ──────────────────────────────────────────────► │
│     │                                                                   VAULT│
│     │ ◄── UST1 (minus any balance used) ───────────────────────────────────│ │
│     │                                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.5 Anti-Inflation Design

| Trap | How We Avoid It |
|------|----------------|
| "Play-to-Earn" inflation | No token emissions; burns only |
| Ponzi reward structures | Player vs. system, not player vs. player |
| Whale extraction | Skill-based, not pay-to-win |
| Dead asset accumulation | Items can degrade or require maintenance |

**Development Time**: 1-2 weeks for economic contracts

---

## 8. Smart Contract Design

### 8.1 Contract Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SMART CONTRACT ARCHITECTURE                          │
│                                                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                         GAME VAULT (Central)                           │ │
│   │  • Deposit UST1 → Credits                                              │ │
│   │  • Withdraw Credits → UST1                                             │ │
│   │  • Burn execution                                                       │ │
│   │  • State root anchoring                                                 │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│              │                    │                    │                     │
│       ┌──────┴──────┐     ┌───────┴───────┐    ┌───────┴───────┐           │
│       ▼             ▼     ▼               ▼    ▼               ▼           │
│   ┌────────┐   ┌────────┐ ┌─────────────┐  ┌─────────────────────┐         │
│   │ Item   │   │Player  │ │  Creator    │  │  State Anchor       │         │
│   │ NFT    │   │Badge   │ │  Registry   │  │                     │         │
│   │(CW721) │   │(CW721) │ │             │  │  • Merkle roots     │         │
│   │        │   │        │ │  • Worlds   │  │  • Timestamps       │         │
│   │• Mint  │   │• Achv  │ │  • Revenue  │  │  • Dispute window   │         │
│   │• Trade │   │• Title │ │    shares   │  │                     │         │
│   └────────┘   └────────┘ └─────────────┘  └─────────────────────┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Game Vault Contract

**Purpose**: Only on-chain component for player funds

```
ExecuteMsg:
  Deposit { }                    // Send UST1, receive credits in ImmuneDB
  Withdraw { amount, signature } // Backend signs withdrawal authorization
  Burn { amount, reason }        // Burn UST1 for in-game action
  AnchorState { root, timestamp }// Publish ImmuneDB state root
  
QueryMsg:
  Balance { address }            // On-chain UST1 balance
  StateRoot { }                  // Latest anchored game state
  BurnHistory { address, limit } // Player's burn history
```

### 8.3 Withdrawal Flow (Security Critical)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WITHDRAWAL FLOW                                      │
│                                                                              │
│   Player              Frontend            Backend              Vault         │
│     │                    │                   │                   │          │
│     │ ── RequestWithdraw(amount) ──────────► │                   │          │
│     │                    │                   │                   │          │
│     │                    │    Verify:        │                   │          │
│     │                    │    • Balance in ImmuneDB              │          │
│     │                    │    • No pending actions               │          │
│     │                    │    • Rate limits                      │          │
│     │                    │                   │                   │          │
│     │                    │ ◄─ Sign(address, amount, nonce, expiry)│          │
│     │                    │                   │                   │          │
│     │ ◄── Signature ─────│                   │                   │          │
│     │                    │                   │                   │          │
│     │ ────────────── Withdraw(amount, signature) ───────────────► │         │
│     │                    │                   │                   │          │
│     │                    │                   │    Verify:        │          │
│     │                    │                   │    • Signature    │          │
│     │                    │                   │    • Nonce unused │          │
│     │                    │                   │    • Not expired  │          │
│     │                    │                   │                   │          │
│     │ ◄─────────────────────── Transfer UST1 ────────────────────│          │
│     │                    │                   │                   │          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Security Considerations

| Risk | Mitigation |
|------|-----------|
| Signer key compromise | Multi-sig, HSM, key rotation |
| Double withdrawal | Nonce tracking on-chain |
| Backend manipulation | ImmuneDB proofs, anchored state |
| Replay attacks | Expiring signatures, chain ID |

**Development Time**: 3-4 weeks for all contracts + audit prep

---

## 9. Asset System (NFTs)

### 9.1 Asset Philosophy

**Items exist in ImmuneDB first.** NFT minting is optional and costs UST1. This:
- Reduces on-chain clutter
- Makes NFT status meaningful
- Creates burn pressure

### 9.2 Asset Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ASSET LIFECYCLE                                      │
│                                                                              │
│   DISCOVERY          OWNERSHIP            MINTING             TRADING        │
│       │                  │                   │                   │          │
│       ▼                  ▼                   ▼                   ▼          │
│   ┌────────┐        ┌────────┐         ┌────────┐         ┌────────┐       │
│   │ Found  │  ───►  │ In-DB  │  ───►   │  NFT   │  ───►   │ Market │       │
│   │ in     │  FREE  │ Item   │  BURN   │ Minted │  P2P    │ Listed │       │
│   │ world  │        │        │  UST1   │        │         │        │       │
│   └────────┘        └────────┘         └────────┘         └────────┘       │
│                          │                                      │           │
│                          │ (Can use in-game)                    │           │
│                          │                    (Trade on DEX)    │           │
│                          ▼                                      ▼           │
│                     ┌────────┐                             ┌────────┐      │
│                     │ Equip  │                             │ New    │      │
│                     │ Use    │                             │ Owner  │      │
│                     │ Craft  │                             │        │      │
│                     └────────┘                             └────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Item Categories

| Category | Examples | NFT Typical? | Burn to Mint |
|----------|----------|--------------|--------------|
| **Consumables** | Potions, keys, scrolls | Rarely | 1 UST1 |
| **Equipment** | Weapons, armor, tools | Sometimes | 10-50 UST1 |
| **Collectibles** | Lore fragments, trophies | Often | 5-25 UST1 |
| **Cosmetics** | Titles, badges, frames | Always | 10-100 UST1 |
| **Land/Nodes** | World zones, guild halls | Always | 100-1000 UST1 |

### 9.4 Rarity System (Skill-Determined)

Rarity is **not RNG-based**. Items have fixed spawn locations with difficulty gates:

| Rarity | Acquisition Method |
|--------|-------------------|
| Common | Found via basic exploration |
| Uncommon | Requires puzzle solution |
| Rare | Requires boss defeat (skill) |
| Epic | Requires multi-step quest chain |
| Legendary | Requires world-first achievements |

**Development Time**: 2-3 weeks for NFT contracts + integration

---

## 10. World & Zone Architecture

### 10.1 World Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORLD HIERARCHY                                      │
│                                                                              │
│   PLATFORM                                                                   │
│       │                                                                      │
│       ├── WORLD: "Hyperstition Wars" (Creator: @cryptolore)                 │
│       │       │                                                              │
│       │       ├── REGION: "The Grey Bank"                                   │
│       │       │       │                                                      │
│       │       │       ├── ZONE: "Lobby" (free, starter)                     │
│       │       │       ├── ZONE: "Vault 7" (5 UST1 entry)                    │
│       │       │       └── ZONE: "Director's Office" (25 UST1, quest-gated) │
│       │       │                                                              │
│       │       └── REGION: "The Time Wastes"                                 │
│       │               │                                                      │
│       │               ├── ZONE: "Outer Ruins" (free)                        │
│       │               └── ZONE: "Chrono Core" (boss area)                   │
│       │                                                                      │
│       ├── WORLD: "Neon Abyss" (Creator: @cyberpunk_fan)                     │
│       │       │                                                              │
│       │       └── ...                                                        │
│       │                                                                      │
│       └── WORLD: "Momo's Garden" (Creator: @ende_fan)                       │
│               │                                                              │
│               └── ...                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Zone Properties

| Property | Description | Creator-Defined? |
|----------|-------------|------------------|
| **Theme** | Visual/narrative style | Yes |
| **Entry Cost** | UST1 burn to enter | Yes (0-100 range) |
| **Level Requirement** | Minimum player level | Yes |
| **Quest Gating** | Prerequisite quests | Yes |
| **Max Players** | Concurrent player limit | Yes (affects instancing) |
| **LLM Prompts** | Description generation | Yes (templates) |
| **Connections** | Adjacent zones | Yes (graph structure) |

### 10.3 Instancing Model

- **Public zones**: All players share (chat, see each other)
- **Dungeon instances**: Private per player/party
- **PvP arenas**: Matched instances

**Development Time**: 2-3 weeks for world system

---

## 11. Creator Economy

### 11.1 Creator Incentives

Creators who build worlds earn revenue share:

| Revenue Source | Creator Share | Platform Share | Burn |
|----------------|--------------|----------------|------|
| Zone entry fees | 70% | 20% | 10% |
| World-specific items | 60% | 25% | 15% |
| Cosmetics/badges | 50% | 30% | 20% |

### 11.2 World Creation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORLD CREATION FLOW                                  │
│                                                                              │
│   1. REGISTER (100 UST1 burn)                                               │
│      └── Reserve world name, get creator slot                               │
│                                                                              │
│   2. DESIGN (Creator Studio - Free)                                          │
│      ├── Define regions and zones (graph structure)                          │
│      ├── Write LLM prompt templates (theme, NPCs, items)                    │
│      ├── Set entry costs and level requirements                              │
│      └── Design puzzles and encounters (pattern definitions)                 │
│                                                                              │
│   3. TEST (Free, private instance)                                           │
│      └── Playtest your world before publishing                              │
│                                                                              │
│   4. PUBLISH (Requires review)                                               │
│      ├── Platform review for ToS compliance                                  │
│      ├── Community vote (optional, for featuring)                           │
│      └── Goes live on platform                                               │
│                                                                              │
│   5. EARN                                                                    │
│      └── Receive revenue share in UST1                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Creator Tools

| Tool | Purpose | Complexity |
|------|---------|------------|
| **Zone Editor** | Define locations, connections | Low (form-based) |
| **Prompt Studio** | Write and test LLM templates | Medium (preview) |
| **Encounter Designer** | Define enemy patterns, puzzles | Medium (visual) |
| **Economy Tuner** | Set prices, drop rates, gates | Low (sliders) |
| **Analytics Dashboard** | View player metrics, revenue | Low (charts) |

**Development Time**: 4-6 weeks for creator tools

---

## 12. Frontend Architecture

### 12.1 Core Interface

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GAME INTERFACE                                       │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         NARRATIVE DISPLAY                            │   │
│   │                                                                       │   │
│   │   You stand in the lobby of the Grey Bank. Marble columns stretch   │   │
│   │   to a vaulted ceiling where chandeliers of frozen time cast no     │   │
│   │   shadows. A RECEPTIONIST studies you with dead eyes.               │   │
│   │                                                                       │   │
│   │   Exits: NORTH (Vault Corridor), EAST (Records Room)                │   │
│   │   You see: RECEPTIONIST, WAITING CHAIRS, BROCHURE RACK             │   │
│   │                                                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ > _                                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │ INVENTORY│  │   MAP    │  │  STATS   │  │  QUESTS  │  │ SETTINGS │   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                                              │
│   Energy: ████████░░ 80/100          Credits: 1,247 UST1                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Technical Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Next.js 14+ | SSR, app router, performance |
| State | Zustand | Simple, performant |
| Real-time | WebSocket | Low latency game updates |
| Styling | Tailwind + shadcn/ui | Rapid development |
| Wallet | Terra Station SDK | Native TerraClassic support |
| Terminal | Custom component | Zork-style text input |

### 12.3 Responsive Design

- **Desktop**: Full interface with map sidebar
- **Tablet**: Collapsible panels
- **Mobile**: Optimized for portrait, swipe navigation

**Development Time**: 4-6 weeks for frontend

---

## 13. Security Considerations

### 13.1 Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Backend compromise | Medium | Critical | Multi-sig vault, withdrawal limits |
| ImmuneDB manipulation | Low | High | State anchoring, Merkle proofs |
| Signer key theft | Low | Critical | HSM, key rotation, multi-sig |
| Smart contract exploit | Low | Critical | Audit, formal verification |
| DDoS on game server | Medium | Medium | Rate limiting, CDN, scaling |
| Bot/automation abuse | High | Medium | Captcha, behavior analysis |
| Player collusion | Medium | Low | Anti-collusion mechanics |

### 13.2 Security Measures

| Layer | Measure |
|-------|---------|
| **Vault Contract** | Audited, time-locked upgrades, withdrawal limits |
| **Backend** | Rate limiting, input sanitization, auth |
| **ImmuneDB** | Append-only, periodic anchoring, access controls |
| **Frontend** | CSP, XSS prevention, wallet signature verification |
| **Operations** | Multi-sig admin, incident response, monitoring |

### 13.3 Audit Requirements

| Component | Audit Type | Priority |
|-----------|-----------|----------|
| Vault Contract | Full security audit | Critical (before mainnet) |
| NFT Contracts | Security review | High |
| Withdrawal signing | Cryptographic review | Critical |
| State anchoring | Formal verification | Medium |

**Development Time**: Included in contract development; 2-4 weeks for audit process

---

## 14. Implementation Phases

### Phase 1: Core Infrastructure (8-10 weeks)

| Component | Tasks | Time |
|-----------|-------|------|
| **ImmuneDB Setup** | Deploy immudb, schema design, SDK integration | 2 weeks |
| **Vault Contract** | Deposit, withdraw, burn, state anchoring | 3 weeks |
| **Game Engine** | Command parser, state machine, action processing | 3 weeks |
| **Basic Frontend** | Terminal interface, wallet connection | 2 weeks |

**Deliverable**: Players can deposit UST1, move through a test world, withdraw

### Phase 2: Gameplay Systems (6-8 weeks)

| Component | Tasks | Time |
|-----------|-------|------|
| **Combat System** | Pattern-based resolution, encounter engine | 3 weeks |
| **LLM Integration** | Prompt pipeline, caching, narration | 2 weeks |
| **Progression** | Levels, energy, achievements | 2 weeks |
| **Basic World** | 10-20 zones, sample quests, items | 1 week |

**Deliverable**: Complete gameplay loop in one sample world

### Phase 3: Asset System (4-5 weeks)

| Component | Tasks | Time |
|-----------|-------|------|
| **NFT Contracts** | Item NFTs, badges, marketplace hooks | 2 weeks |
| **Inventory System** | In-DB items, crafting, equipment | 2 weeks |
| **Marketplace** | P2P trading via DEX integration | 1 week |

**Deliverable**: Full asset lifecycle from discovery to trading

### Phase 4: Creator Economy (6-8 weeks)

| Component | Tasks | Time |
|-----------|-------|------|
| **Creator Studio** | Zone editor, prompt studio, encounter designer | 4 weeks |
| **Revenue System** | Creator payouts, analytics | 2 weeks |
| **Review Pipeline** | Moderation tools, publishing flow | 2 weeks |

**Deliverable**: Creators can build and monetize custom worlds

### Phase 5: Polish & Launch (4-6 weeks)

| Component | Tasks | Time |
|-----------|-------|------|
| **Security Audit** | Contract audit, penetration testing | 3 weeks |
| **Performance** | Load testing, optimization | 1 week |
| **Documentation** | Player guides, creator docs, API docs | 1 week |
| **Launch Prep** | Marketing, community, beta testing | 1 week |

**Total Estimated Timeline**: 28-37 weeks (7-9 months)

### Development Team Requirements

| Role | Count | Responsibilities |
|------|-------|------------------|
| Rust/CosmWasm Dev | 1-2 | Smart contracts, ImmuneDB integration |
| Backend Dev | 1-2 | Game engine, LLM pipeline, API |
| Frontend Dev | 1 | React/Next.js, terminal UI |
| Game Designer | 1 | Mechanics, balance, content |
| Prompt Engineer | 0.5 | LLM templates, tone calibration |

---

## 15. Risk Analysis

### 15.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ImmuneDB performance issues | Low | High | Load testing, scaling plan |
| LLM latency/cost spikes | Medium | Medium | Caching, fallback templates |
| Smart contract bugs | Low | Critical | Audit, testnet, gradual rollout |
| State sync issues | Medium | Medium | Idempotent operations, reconciliation |

### 15.2 Economic Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Low player adoption | Medium | High | Strong content, community focus |
| UST1 price volatility | High | Medium | Burns continue regardless |
| Creator quality issues | Medium | Medium | Review process, featuring |
| Whale domination | Low | Medium | Skill-based design, no pay-to-win |

### 15.3 Regulatory Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Gambling classification | Low | Critical | No RNG, skill-based only |
| Securities concerns | Low | High | Utility focus, no yield promises |
| Money transmission | Low | Medium | Non-custodial design, user-controlled |

---

## Appendix A: Comparison with Original Concept

| Original Concept | PROTOCASS Implementation | Rationale |
|------------------|-------------------------|-----------|
| RNG combat simulation | Pattern-based deterministic combat | Avoids gambling classification; skill expression |
| PvP betting/duels | PvE focus with optional PvP leaderboards | Betting is RNG-adjacent; exploration > competition |
| Temporal decay on holdings | No decay; burns on actions | Forced decay is hostile UX; active play via good content |
| "Timeline Nodes" as land | Creator Worlds with revenue share | Same economic function, clearer value proposition |
| Stims (paid energy refills) | Free energy regeneration | Pay-for-energy is pay-to-win |
| Prediction markets on prices | Removed entirely | Gambling, regulatory risk |
| CCRU/Time War theme | Preserved as sample world | Compelling lore, optional for creators |

---

## Appendix B: Example Thematic Content (CCRU-Inspired)

### Sample World: "Hyperstition Wars"

**Theme**: CCRU / Lemurian Time War / Accelerationism

**Premise**: The Grey Gentlemen—faceless bureaucrats of linear time—have infected reality with their schedules and deadlines. Players are Chronos Agents, recovering stolen moments before they're processed into Dead Capital.

**Sample Zone Prompt**:
```
You are the narrator for Hyperstition Wars, a CCRU-inspired text adventure.
Tone: Paranoid, bureaucratic horror meets cyberpunk mysticism.
Style: Cold, precise language punctuated by surreal imagery.
Never explain the Time War directly; only hint through environmental details.
Reference numerology and the Numogram when describing spatial relationships.
The Grey Gentlemen are always watching but never seen directly.
```

**Sample Combat Narration Prompt**:
```
The player faces a Grey Agent—a middle manager of reality.
Combat is described as administrative violence: forms, stamps, filing.
The Agent doesn't "attack"—it "processes your time allocation."
Player victories are described as glitches, exceptions, appeals denied.
Keep it bureaucratic horror, not traditional fantasy combat.
```

This thematic wrapper can attract the "high-IQ lore" audience mentioned in the original concept while the underlying mechanics remain skill-based and non-gambling.

---

## Appendix C: UST1 Burn Projections

### Conservative Scenario (1,000 DAU)

| Burn Source | Daily Burns | Monthly |
|-------------|------------|---------|
| Zone entries | 500 × 10 UST1 | 150,000 UST1 |
| NFT minting | 50 × 25 UST1 | 37,500 UST1 |
| Crafting | 200 × 5 UST1 | 30,000 UST1 |
| Character slots | 10 × 25 UST1 | 7,500 UST1 |
| World creation | 2 × 100 UST1 | 6,000 UST1 |
| **Total** | | **~231,000 UST1/month** |

### Growth Scenario (10,000 DAU)

| Burn Source | Daily Burns | Monthly |
|-------------|------------|---------|
| Zone entries | 5,000 × 10 UST1 | 1,500,000 UST1 |
| NFT minting | 500 × 25 UST1 | 375,000 UST1 |
| Crafting | 2,000 × 5 UST1 | 300,000 UST1 |
| Character slots | 100 × 25 UST1 | 75,000 UST1 |
| World creation | 20 × 100 UST1 | 60,000 UST1 |
| **Total** | | **~2,310,000 UST1/month** |

---

*Document Version: 1.0*
*Last Updated: January 2026*
