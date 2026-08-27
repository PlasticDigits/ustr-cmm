# USTR CMM Architecture

> **📖 Official Documentation**: For TerraClassic network documentation, see [docs.terra-classic.io](https://docs.terra-classic.io).

## System Overview

The USTR CMM system consists of smart contracts that work together to implement a collateralized unstablecoin system on TerraClassic:

- **USTR Token** — CW20 utility/governance token (cw20-mintable)
- **Treasury** — Secure asset custody with 7-day governance timelock
- **USTC-Swap** — Time-limited USTC→USTR exchange with linear rate decay
- **Airdrop** — Batch CW20 distribution for preregistration rewards
- **UST1 Token** — Live CW20 unstablecoin (`terra1f0eq…fy72`); minted/burned by ust1-window against treasury vFDUSD

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
│         │ USTC (MsgExecuteContract)                  │             │
│         │ Swap { referral_code, leaderboard_hint }   │             │
│         ▼                                            │             │
│  ┌──────────────┐      ┌──────────────┐                           │
│  │  USTR TOKEN  │◄─────│  USTC-SWAP   │  Calculates rate,         │
│  │  (CW20)      │ Mint │  CONTRACT    │  mints USTR to user       │
│  └──────────────┘      └──────┬───────┘                           │
│                               │ BankMsg::Send (0.5% tax)           │
│                               ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      TREASURY CONTRACT                      │   │
│  │  Passive custodian — holds USTC forwarded from ustc-swap    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐     LIVE (ust1-window)                           │
│  │  UST1 TOKEN  │     Collateralized unstablecoin                  │
│  │  (CW20)      │     minted/burned vs treasury vFDUSD             │
│  └──────────────┘     CR = non-protocol USD / UST1 available supply│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Tax on Swap Forward

TerraClassic applies a **0.5% burn tax** on native token transfers via `BankMsg::Send`. The live swap path uses this taxed forward:

- **Users call `Swap { referral_code, leaderboard_hint }` on ustc-swap** with USTC attached via `MsgExecuteContract` (no tax on the user→contract call)
- **ustc-swap calculates the rate and mints USTR** to the user (on the pre-tax amount)
- **ustc-swap forwards USTC to Treasury** via `BankMsg::Send` (0.5% burn tax applies on this forward)

Treasury is a passive custodian for swap USTC; it does not participate in swap execution. The tax cost is offset by up to 20% referral bonus. See [skills/treasury-swap-removal](../skills/treasury-swap-removal/SKILL.md) and [#8](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/8) for removal of the legacy tax-free `SwapDeposit` / `NotifyDeposit` path.

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

**Purpose**: Secure custody of all protocol assets + wrap/CW20 inventory pulls

**Key Functions**:
- Accept and hold native tokens (USTC, LUNC), including USTC forwarded from ustc-swap
- Accept and hold CW20 tokens
- Governance-controlled withdrawals with 7-day timelock
- 7-day timelock on governance changes
- Native wrapping custody (`WrapDeposit` / wrapper `InstantWithdraw`)
- Registered CW20 spender pulls (`InstantWithdrawCw20`) for ust1-window vFDUSD redeem, with per-(spender, token) 24h pull limits — see [#6](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/6), [#7](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/7), and [skills/treasury-cw20-instant-withdraw](../skills/treasury-cw20-instant-withdraw/SKILL.md)

**Dependencies**: 
- Wrap-mapper (registered via `SetDenomWrapper`)
- ust1-window (registered via `SetCw20Spender` for vFDUSD; companion [ust1-window#20](https://gitlab.com/PlasticDigits/ust1-window/-/work_items/20))

### USTC-Swap Contract

**Purpose**: Time-limited USTC→USTR exchange rate tracking and minting

**Key Functions**:
- **Receive `Swap` from users** with USTC attached
- Calculate current exchange rate
- Mint USTR to users based on deposit amount
- Forward USTC to Treasury via `BankMsg::Send`
- Track swap statistics

**Dependencies**: 
- USTR Token (minter)
- Treasury (USTC destination for forwarded funds)

### Airdrop Contract

**Purpose**: Batch distribution of CW20 tokens to multiple recipients

**Implementation**: Code ID `10700`, Address `terra1m758wqc6grg7ttg8cmrp72hf6a5cej5zq0w59d9d6wr5r22tulwqk3ga5r`

**Key Functions**:
- Distribute any CW20 token to multiple recipients atomically
- Uses CW20 allowance mechanism (TransferFrom)
- No maximum recipients (limited only by block gas)

**Dependencies**:
- CW20 token contract (for TransferFrom)

### UST1 Token Contract

**Purpose**: Collateralized unstablecoin. Mainnet CW20 `10184` at `terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72` (6 decimals). Outstanding supply is `token_info.total_supply` (minted − burned on this token).

**Key Functions**:
- Mint / burn via ust1-window (vFDUSD deposit → mint; redeem → burn)
- Public Treasury page shows available supply + CR (frontend; not an on-chain CR contract)

**Dependencies**:
- Treasury (collateral custody, including bridged vFDUSD)
- ust1-oracle (Venus-normalized vFDUSD rate for USD display / CR numerator)
- ust1-window (minter / burner)

**Decimal Handling**: The system uses each token's on-chain decimal configuration for CR calculations, ensuring oracle prices match regardless of decimal count (6 for native `uusd` / UST1 / vFDUSD, 18 for USTR). Frontend splits bigint before JS `Number` — see [skills/frontend-ust1-ratios](../skills/frontend-ust1-ratios/SKILL.md).

**Do not double-count wraps or protocol tokens:** cLUNC / cUSTC available supply is informational; native LUNC / USTC in treasury are the CR assets. UST1 / USTR (spot or LP legs) are not CR assets — see [#16](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/16) / [skills/frontend-treasury-available-supply](../skills/frontend-treasury-available-supply/SKILL.md).

## Data Flow

### Swap Flow (Atomic)

All steps execute **atomically within a single transaction**:

```
┌─────────────────── SINGLE ATOMIC TRANSACTION ───────────────────┐
│                                                                 │
│  1. User → ustc-swap: Swap { referral_code, leaderboard_hint } │
│     with USTC attached [NO TAX: MsgExecuteContract]            │
│                           │                                     │
│                           ▼                                     │
│  2. ustc-swap: Calculate rate, validate period active        │
│  3. ustc-swap: Calculate ustr_amount = ustc_amount / rate      │
│                           │                                     │
│                           ▼ (submessage)                        │
│  4. ustc-swap → USTR Token: Mint USTR to user                  │
│     [WasmMsg::Execute - same transaction]                      │
│                           │                                     │
│                           ▼                                     │
│  5. ustc-swap → Treasury: BankMsg::Send USTC                   │
│     [0.5% burn tax applies on forward]                         │
│                                                                 │
│  If ANY step fails → entire transaction reverts                │
│                       (USTC returned to user)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Tax note**: USTR is calculated on the pre-tax USTC amount; the user pays the 0.5% burn tax when ustc-swap forwards USTC to Treasury. Referral bonuses (up to 20%) offset the tax cost.

**Atomic Guarantees**: ustc-swap mints USTR via `WasmMsg::Execute` and forwards USTC via `BankMsg::Send` in the same transaction. If any step fails, everything reverts.

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
1. Governance → Treasury: ProposeWithdraw(destination, asset, amount)
2. Treasury: Verify sender == governance
3. Treasury: Store pending_withdrawal with execute_after = now + 7 days
4. [7 days pass]
5. Governance → Treasury: ExecuteWithdraw(withdrawal_id)
6. Treasury: Verify block_time >= execute_after
7a. If native: Treasury → Destination: BankMsg::Send
7b. If CW20: Treasury → CW20 Contract: Transfer to destination
```

### CW20 InstantWithdraw Flow (registered spender, e.g. ust1-window)

```
1. Governance → Treasury: SetCw20Spender { token: vFDUSD, spender: window, limit_24h }
   (or SetCw20Spender + SetCw20SpenderLimit — fail-closed if limit unset)
2. User redeems UST1 on window (window burns UST1 / settles)
3. Window → Treasury: InstantWithdrawCw20 { recipient: user, token: vFDUSD, amount }
4. Treasury: pause check (cw20_instant_withdraw_paused only — not wrapping_paused)
5. Treasury: sender == CW20_SPENDERS[token]; balance ≥ amount
6. Treasury: tumbling 24h pull limit for (token, spender); deny if unset / exceeded
7. Treasury → vFDUSD CW20: Transfer { recipient: user, amount }
```

Timelocked `ProposeWithdraw` remains the only path for arbitrary destinations / non-registered spenders and is **not** gated by CW20 pull limits.

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
| `pending_governance` | `Map<Addr, PendingGovernance>` | Pending governance proposals (multiple can exist) |
| `timelock_duration` | `u64` | Governance change delay (seconds) |
| `pending_withdrawals` | `Map<String, PendingWithdrawal>` | Pending withdrawal proposals |
| `cw20_whitelist` | `Map<Addr, bool>` | CW20 tokens included in balance tracking |
| `denom_wrappers` | `Map<String, Addr>` | Native denom → wrap-mapper |
| `cw20_spenders` | `Map<String, Addr>` | CW20 token → InstantWithdrawCw20 spender |
| `cw20_pull_limits` | `Map<(token, spender), Config>` | 24h max InstantWithdrawCw20 amount per pair |
| `cw20_pull_limit_state` | `Map<(token, spender), State>` | Tumbling-window usage (`amount_used`, `window_start`) |
| `cw20_iw_paused` | `Item<bool>` | Pause for CW20 InstantWithdraw (absent = false) |
| `wrapping_paused` | `bool` (in Config) | Pause for WrapDeposit + native InstantWithdraw |

### USTC-Swap State

| Key | Type | Description |
|-----|------|-------------|
| `config` | `Config` | Token addresses, rates, timing, treasury address |
| `total_ustc_received` | `Uint128` | Cumulative USTC received from swaps |
| `total_ustr_minted` | `Uint128` | Cumulative USTR issued |
| `paused` | `bool` | Emergency pause status |
| `referral_code_stats` | `Map<String, ReferralCodeStats>` | Per-code reward tracking (rewards earned, user bonuses, swap count) |
| `leaderboard_head` | `Option<String>` | Head of sorted linked list (code with highest rewards) |
| `leaderboard_links` | `Map<String, LeaderboardLink>` | Linked list pointers for leaderboard ordering |

**Referral Tracking**: Each referral code tracks cumulative rewards paid to the referrer (`total_rewards_earned`), bonuses given to users (`total_user_bonuses`), and swap count (`total_swaps`). For example, if 100 USTR is swapped using a code, the referrer earns 10 USTR (10% bonus).

**Leaderboard**: Uses a sorted doubly-linked list to rank codes by `total_rewards_earned`. Queries traverse from `leaderboard_head` following `next` pointers for efficient pagination.

## Security Model

### Access Control

| Contract | Role | Permissions |
|----------|------|-------------|
| USTR Token | Minter | Mint tokens |
| Treasury | Governance | Propose governance, withdraw, set denom wrappers / CW20 spenders + 24h pull limits, pause flags |
| Treasury | Pending Governance | Accept governance |
| Treasury | Any User | `WrapDeposit` (native wrap path) |
| Treasury | Registered wrapper | Native `InstantWithdraw` for its denom |
| Treasury | Registered CW20 spender | `InstantWithdrawCw20` for its token only, within configured 24h quota |
| USTC-Swap | Admin | Pause/resume, update admin |
| USTC-Swap | Any User | `Swap` with USTC attached (mints USTR, forwards USTC to treasury) |
| Airdrop | Any User | Execute airdrop (must have CW20 allowance) |

### Timelock Protection

The 7-day timelock on treasury governance changes and withdrawals provides:
- Time for community to detect malicious proposals
- Opportunity to raise concerns before changes execute
- Protection against compromised keys taking immediate action
- Prevents rushed withdrawals that could drain treasury assets

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

## Frontend Dashboard Architecture

### Single Source of Truth (SSoT) Dashboard

The SSoT Dashboard is a critical system component that serves as the authoritative reference for CMM state:

**Core Features** (Treasury page — live subset; full SSoT dashboard is still a later phase):
- **CR Ratios Display**: Collateralization = (priced non-protocol spot USD + LP `other` NAV) / UST1 **available supply** × 100. Available = outstanding − CMM-owned (treasury spot + allowlisted LP claims). `∞` only when those queries succeeded and available is 0; otherwise Key Ratios is hidden. See [#16](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/16) / [skills/frontend-treasury-available-supply](../skills/frontend-treasury-available-supply/SKILL.md) (revises [#11](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/11) / [skills/frontend-ust1-ratios](../skills/frontend-ust1-ratios/SKILL.md)).
- **Current Tier Indicator**: ECONOMICS bands RED `<95` / YELLOW `[95, 110)` / GREEN `[110, 190]` / BLUE `>190` (including `∞`). Treasury-page copy is swap + staking-reward **status display**, not on-chain enforcement.
- **Price gate**: if any CR-relevant price is missing or still loading, Key Ratios shows only `prices not loaded, cannot display key ratios`.
- **Basket of Assets**: Treasury holdings including vFDUSD; USD from CEX/DEX plus session-once ust1-oracle ([#10](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/10) / [skills/frontend-vfdusd-oracle](../skills/frontend-vfdusd-oracle/SKILL.md)). Allowlisted protocol LP shares (`UST1|USTR|cUSTC|cLUNC|CL8Y-cb` pairs) use reserve NAV, not LP-mint simulate-swap ([#14](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/14) / [skills/frontend-treasury-lp-nav](../skills/frontend-treasury-lp-nav/SKILL.md)). UST1 / USTR / wrap **legs** are display-only. CL8Y-cb legs are `other` and enter CR ([#20](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/20)). New CL8Y pairs are discovered from the indexer catalog and pinned only after LCD shows a treasury hold ([#18](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/18) / [skills/frontend-treasury-cl8y-holdings](../skills/frontend-treasury-cl8y-holdings/SKILL.md)).
- **Issuance cards**: `+ Outstanding − CMM-owned = Available Supply` for UST1, USTR, cLUNC, cUSTC. Raw protocol tokens never appear as asset rows.
- **Legal clickwrap**: connected wallets must accept CL8Y terms for `ust1cmm.com` before swap/register ([#12](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/12) / [skills/frontend-legal-clickwrap](../skills/frontend-legal-clickwrap/SKILL.md))
- **Wallet connect**: Trust Wallet and other Keplr-compatible in-app browsers use `WalletName.KEPLR` (`window.keplr` or `window.trustwallet.cosmos`). See [#4](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/4) / [docs/WALLETS.md](./WALLETS.md) / [skills/frontend-keplr-compatible-wallets](../skills/frontend-keplr-compatible-wallets/SKILL.md).

**Why SSoT Matters**:
- Eliminates reliance on third-party data aggregators that may report incorrectly
- Prevents misinformation from false CW20 tokens affecting perceived ratios
- Provides single authoritative view of system state
- Enables users to verify on-chain data directly

### Multi-Sig Dashboard (Phase 2)

- Human-readable proposal explanations
- Approval/veto interface for multi-sig signers
- Proposal queue with clear descriptions
- Multi-sig signers serve as security veto layer only (no ownership or financial benefit)

## Upgrade Path

### Phase 1 → Phase 2

Adding UST1 unstablecoin:
1. Deploy UST1 token contract
2. Deploy collateralization contract (configured to query treasury balances for CR calculation)
3. Add collateralization contract as UST1 minter
4. Collateral remains in treasury; governance may authorize withdrawals only for buyback auctions (when UST1 trades below $1)

### Phase 1.5 → Phase 2: Multi-Sig Transition

Adding multi-sig security layer:
1. Deploy multi-sig contract (3-of-5 threshold)
2. Multi-sig signers are security volunteers—no ownership or profit rights
3. Dev admin retains sole proposal creation authority
4. Multi-sig acts as veto-only system to prevent compromised admin actions

### Phase 2 → Phase 3

Transitioning to DAO governance:
1. Deploy DAO governance contract
2. Propose DAO contract as new treasury governance
3. After 7-day timelock, DAO accepts governance
4. All treasury operations now require DAO approval

