# USTR CMM Contract Interfaces

This document provides an overview of all USTR CMM smart contracts with links to their source code and key development decisions.

> **📖 Official Documentation**: For TerraClassic network documentation, see [terra-classic.io/docs](https://terra-classic.io/docs).
>
> **Development Reference**: For working examples of TerraClassic contract patterns, see the 
> git submodules in `contracts/external/`. The `cw20-mintable` submodule demonstrates CosmWasm 
> contract structure, and `cmm-ustc-preregister/smartcontracts-terraclassic/` shows a complete 
> contract with tests and deployment scripts.

---

## USTR Token Contract

**Location**: External dependency - [PlasticDigits/cw20-mintable](https://github.com/PlasticDigits/cw20-mintable)

**Source**: `contracts/external/cw20-mintable/` (git submodule)

**Description**: The USTR token is a standard CW20 mintable token. We do not maintain a custom token contract. The USTR and UST1 tokens are instantiated using the existing cw20-mintable code deployed on TerraClassic.

**Deployed Code IDs**:
- Mainnet: `10184`
- Testnet: `1641`

**Deployed Contract Addresses**:
- Mainnet (columbus-5): `terra1vy3kc0swag2rhn7jz6n72jp0l2ns0p6r6ez5grxq5uhj2rvs97fqfsetxv`

**Key Features**:
- Standard CW20 operations (transfer, burn, allowance)
- Mintable extension for authorized minters
- Multi-minter support (AddMinter, RemoveMinter)
- Marketing extension (optional logo, description)

**Development Decisions**:
- Uses 18 decimals (standard for CW20 Mintable)
- CMM system is compatible with any decimal count and handles conversions automatically
- Minter list is not frozen and can be modified by admin until governance transition
- Admin initially controls minter permissions; can be transferred to governance in future phase

**Documentation**: See [cw20-mintable README](https://github.com/PlasticDigits/cw20-mintable) for full interface documentation.

---

## Treasury Contract

**Location**: [`contracts/contracts/treasury/`](../../contracts/contracts/treasury/)

**Source Files**:
- [`src/lib.rs`](../../contracts/contracts/treasury/src/lib.rs) - Module exports and documentation
- [`src/contract.rs`](../../contracts/contracts/treasury/src/contract.rs) - Main contract logic
- [`src/msg.rs`](../../contracts/contracts/treasury/src/msg.rs) - Message definitions
- [`src/state.rs`](../../contracts/contracts/treasury/src/state.rs) - State management
- [`src/error.rs`](../../contracts/contracts/treasury/src/error.rs) - Error types

**Description**: Secure custodian for all protocol assets. Holds USTC received from swaps and will eventually hold the diversified basket of assets backing UST1.

**Key Features**:
- Holds native tokens (USTC, LUNC, etc.) and CW20 tokens
- Governance address with 7-day timelock on changes
- Two-step governance transfer (propose → accept)
- Multiple governance proposals can exist simultaneously
- Unified withdrawal interface for all asset types with 7-day timelock
- CW20 whitelist for balance tracking and CR calculations

**Execute Messages**:
- `ProposeGovernanceTransfer { new_governance }` - Initiates 7-day timelock for governance transfer; multiple proposals can exist simultaneously
- `AcceptGovernanceTransfer {}` - Completes governance transfer for sender's address after timelock expires; only clears the accepted proposal (other pending proposals remain and can be cancelled by new governance)
- `CancelGovernanceTransfer { proposed_governance }` - Cancels a specific pending governance proposal
- `ProposeWithdraw { destination, asset, amount }` - Proposes a withdrawal with 7-day timelock (governance only)
- `ExecuteWithdraw { withdrawal_id }` - Executes a pending withdrawal after timelock expires (governance only)
- `CancelWithdraw { withdrawal_id }` - Cancels a specific pending withdrawal (governance only)
- `AddCw20 { contract_addr }` - Adds CW20 token to balance tracking whitelist
- `RemoveCw20 { contract_addr }` - Removes CW20 token from whitelist
- `SetSwapContract { contract_addr }` - Sets the authorized swap contract address (governance only)
- `SwapDeposit {}` - **(Legacy)** Accepts USTC for swap; not used in current architecture
- `Receive(Cw20ReceiveMsg)` - CW20 receive hook for accepting direct token transfers

**Note**: The `SwapDeposit` message exists on the deployed Treasury contract but is not used in the current swap architecture. Users should call `Swap {}` on the Swap contract directly, which forwards USTC to Treasury and mints USTR with optional referral bonuses.

**Query Messages**:
- `Config {}` - Returns current governance and timelock settings
- `PendingGovernance {}` - Returns all pending governance proposals (empty list if none)
- `PendingWithdrawals {}` - Returns all pending withdrawal proposals (empty list if none)
- `Balance { asset }` - Returns treasury balance for specified asset
- `AllBalances {}` - Returns all treasury holdings (native + whitelisted CW20s)
- `Cw20Whitelist {}` - Returns list of whitelisted CW20 contract addresses

**Key Development Decisions**:

1. **CW20 Abuse Prevention**: While anyone can send any CW20 token to the treasury, only tokens on the whitelist are counted toward the Collateralization Ratio (CR). This prevents attacks where bad actors create worthless tokens, inflate prices, send to treasury, then pull liquidity.

2. **Direct CW20 Transfers**: Users can send CW20 tokens directly to the treasury address (no deposit mechanism required) for best UX. The treasury accepts via CW20 receive hook.

3. **Unified Asset Interface**: Single `Withdraw` message handles both native tokens and CW20 tokens through the `AssetInfo` enum, simplifying governance operations.

4. **7-Day Timelock**: Both governance changes and withdrawals require a 7-day waiting period (604,800 seconds) to prevent rushed malicious actions. This provides time for the community to detect and respond to potentially harmful proposals.

5. **Two-Step Governance Transfer**: New governance must explicitly accept the role after timelock expires, preventing accidental transfers.

6. **Multiple Pending Proposals**: Multiple governance proposals can exist simultaneously. Each proposed address has its own timelock. When a proposal is accepted, **only that specific proposal is cleared**—other pending proposals remain valid. This prevents gas-griefing attacks where an attacker creates thousands of proposals to make acceptance prohibitively expensive. New governance should cancel any unwanted pending proposals after accepting.

7. **Decimal Handling**: System uses each token's on-chain decimal count when calculating CR ratios, ensuring oracle prices match regardless of decimal configuration (6 for native `uusd`, 18 for most CW20s, etc.).

8. **Governance Transition Plan**: In Phase 1, governance is a single admin EOA. Phase 2 will transfer governance to a multi-sig with additional security measures. Phase 3+ will implement full DAO governance with on-chain voting. The treasury contract implements withdrawal timelocks directly, providing security at the contract level regardless of the governance mechanism.

**Security Features**:
- Governance changes require 7-day waiting period
- Withdrawals require 7-day waiting period
- Current governance can cancel pending transfers and withdrawals
- All actions emit events for transparency
- No direct access to assets except via explicit withdrawal proposals
- Gas attack prevention: accepting governance only clears the accepted proposal (not all pending proposals)

**Withdrawal Tax Note**: Native token withdrawals use `BankMsg::Send`, which incurs TerraClassic's 0.5% burn tax. The `amount` specifies what is debited from treasury; the destination receives the post-tax amount.

**Full Specification**: See [PROPOSAL.md](../PROPOSAL.md#treasury-contract) for complete interface details.

---

## USTC-Swap Contract

**Location**: [`contracts/contracts/ustc-swap/`](../../contracts/contracts/ustc-swap/)

**Source Files**:
- [`src/lib.rs`](../../contracts/contracts/ustc-swap/src/lib.rs) - Module exports and documentation
- [`src/contract.rs`](../../contracts/contracts/ustc-swap/src/contract.rs) - Main contract logic
- [`src/msg.rs`](../../contracts/contracts/ustc-swap/src/msg.rs) - Message definitions
- [`src/state.rs`](../../contracts/contracts/ustc-swap/src/state.rs) - State management
- [`src/error.rs`](../../contracts/contracts/ustc-swap/src/error.rs) - Error types

**Description**: Time-limited, one-way exchange mechanism that allows users to convert USTC into USTR at a rate that increases over 100 days, incentivizing early participation. Includes referral system integration for viral growth.

**Architecture**: Users send USTC directly to this contract, which forwards it to Treasury and mints USTR. The user pays the 0.5% TerraClassic burn tax when USTC is forwarded to Treasury, but USTR is calculated on the pre-tax amount. See [On-Chain Tax Handling](#on-chain-tax-handling) for details.

**Economic Parameters**:
- Start rate: 1.5 USTC per 1 USTR
- End rate: 2.5 USTC per 1 USTR
- Duration: 100 days (8,640,000 seconds)
- Rate updates: Continuous (calculated per-second)
- Post-duration: No further USTR issuance
- Referral bonus: +10% to user, +10% to referrer (if valid code provided)

**Execute Messages**:
- `Swap { referral_code, leaderboard_hint }` - User sends USTC; contract forwards to Treasury (0.5% tax); mints USTR with optional referral bonus. Optional hint enables O(1) leaderboard insertion.
- `EmergencyPause` - Pauses swap functionality (admin only)
- `EmergencyResume` - Resumes swap functionality (admin only)
- `ProposeAdmin` - Initiates 7-day timelock for admin transfer
- `AcceptAdmin` - Completes admin transfer after timelock
- `CancelAdminProposal` - Cancels pending admin change
- `RecoverAsset` - Recovers stuck assets (available after swap period ends)

**Query Messages**:
- `Config` - Returns all contract configuration (including referral contract address)
- `CurrentRate` - Returns current USTC/USTR exchange rate
- `SwapSimulation { ustc_amount, referral_code }` - Returns USTR amount including referral bonus if applicable
- `Status` - Returns active/ended status, time remaining
- `Stats` - Returns total USTC received, total USTR minted, referral stats (including `unique_referral_codes_used`)
- `PendingAdmin` - Returns pending admin proposal details
- `ReferralCodeStats { code }` - Returns per-code reward statistics (total_rewards_earned, total_user_bonuses, total_swaps)
- `ReferralLeaderboard { start_after, limit }` - Paginated leaderboard of referral codes ranked by total rewards earned

**Referral Leaderboard & Stats:**

The swap contract tracks per-code statistics for analytics and leaderboard functionality:

| Field | Type | Description |
|-------|------|-------------|
| `total_rewards_earned` | `Uint128` | Cumulative USTR earned by referrer from this code |
| `total_user_bonuses` | `Uint128` | Cumulative USTR bonuses given to users using this code |
| `total_swaps` | `u64` | Number of swaps that used this referral code |

The leaderboard query returns entries sorted by `total_rewards_earned` (descending) with pagination support:
- `start_after`: Optional code for cursor-based pagination
- `limit`: Max entries per page (default: 10, max: 50)
- Response includes `has_more` boolean indicating additional pages

**Leaderboard Data Structure (Top 50 Only):**

The leaderboard uses an **optimized sorted doubly-linked list** that tracks only the **top 50 referral codes** by `total_rewards_earned`. This design provides **O(50) bounded gas costs** instead of O(n) unbounded costs, regardless of how many total referral codes exist.

| State Key | Type | Description |
|-----------|------|-------------|
| `leaderboard_head` | `Option<String>` | Head of linked list (code with highest rewards) |
| `leaderboard_tail` | `Option<String>` | Tail of linked list (50th place, threshold for entry) |
| `leaderboard_size` | `u32` | Current entries in leaderboard (0-50) |
| `leaderboard_links` | `Map<String, LeaderboardLink>` | Linked list pointers for codes in top 50 |

```rust
LeaderboardLink {
    prev: Option<String>,  // Previous code (higher rewards)
    next: Option<String>,  // Next code (lower rewards)
}
```

**Why Top 50 Only?**

For gas efficiency. An unbounded leaderboard with 500+ codes would require O(500) storage operations per swap. The top-50 approach guarantees bounded costs:

| Operation | Gas Cost |
|-----------|----------|
| Code not in top 50, doesn't qualify | O(2) reads |
| Code enters top 50 (new) | O(50) max |
| Code already in top 50, moves up | O(1-5) typical |
| Query top 10 | O(10) |

**How it works:**
- **Insertion**: When a swap uses a referral code:
  - If code is already in top 50: check if it needs to move up (walk upward only, O(1-5))
  - If code is not in top 50 and list has room: insert at correct position
  - If code is not in top 50 and list is full: compare against tail, replace if higher
- **Traversal**: Leaderboard queries start at `leaderboard_head` and follow `next` pointers for O(k) access to top k entries.
- **Per-code stats**: `REFERRAL_CODE_STATS` tracks ALL codes (not just top 50), so `ReferralCodeStats { code }` query works for any code that has been used.

**Trade-off**: Codes ranked #51+ don't appear in `ReferralLeaderboard` query, but their individual stats are still queryable via `ReferralCodeStats { code }`.

**Leaderboard Hint Optimization:**

The `Swap` message accepts an optional `leaderboard_hint` parameter for O(1) leaderboard insertion instead of O(50):

```rust
LeaderboardHint {
    insert_after: Option<String>,  // Code immediately before us (higher rewards)
                                   // None = we claim to be the new head
}
```

**How the frontend uses hints:**
1. Query `ReferralLeaderboard` to get current top 50 with their rewards
2. After a swap, calculate where the code's new rewards would place it
3. Pass `leaderboard_hint` with the correct `insert_after` code
4. Contract validates in O(1) and inserts, or falls back to searching if wrong

**Fallback behavior:** If the hint is wrong, the contract searches from the hint position (up or down depending on the error). This means:
- Correct hint: O(1) insertion
- Hint off by 5 positions: O(5) search
- No hint: O(50) worst case

Wrong hints do not cause failures—the user just pays more gas. This is similar to DEX slippage but self-punishing rather than rejecting.

**Key Development Decisions**:

1. **Direct Swap Flow**: Users call `Swap {}` with USTC attached. Contract forwards USTC to Treasury via `BankMsg::Send` (0.5% burn tax applies) and mints USTR. The contract does not hold custody—funds are forwarded atomically.

2. **User Pays 0.5% Tax**: The TerraClassic burn tax is paid when forwarding USTC to Treasury. USTR is calculated on the **pre-tax amount**, so users receive full USTR value. The tax is offset by up to 20% referral bonus.

3. **Referral Integration**: Queries the Referral contract to validate codes and get owner addresses. Valid codes grant +10% USTR to user and +10% to referrer. Self-referral is allowed (user gets full 20%).

4. **Invalid Referral Codes Error**: If a non-empty referral code is invalid or not registered, the transaction fails. Empty/None codes proceed without bonus.

5. **Linear Rate Progression**: Rate follows linear interpolation: `rate(t) = start_rate + ((end_rate - start_rate) * elapsed_seconds / total_seconds)`. This creates a Schelling point attractor that encourages early adoption.

6. **High Precision Calculations**: Uses CosmWasm's `Decimal` type (10^18 precision) for intermediate calculations to avoid rounding errors at per-second granularity.

7. **Floor Rounding**: Final USTR amounts use floor rounding to favor the protocol and prevent rounding exploits.

8. **Minimum Swap Amount**: Swaps less than 1 USTC (1,000,000 micro units) are rejected to prevent dust attacks. At ~$0.02 per USTC, executing 1M spam transactions would cost $20,000+, exceeding exploit profit.

9. **Atomic Execution**: Entire swap operation (USTC forward → USTR mint) happens atomically. If any step fails, entire transaction rolls back and USTC is returned.

10. **Permanent Disable**: After 100 days, contract is permanently disabled. No reactivation possible. Admin can only recover stuck assets.

11. **Emergency Pause**: Admin can pause swaps while queries remain available, allowing users to check rates and status during emergencies.

12. **7-Day Admin Timelock**: Admin address changes require 7-day timelock (same as treasury governance) for security.

**Full Specification**: See [PROPOSAL.md](../PROPOSAL.md#ustc-to-ustr-swap-contract) for complete interface details.

---

## Airdrop Contract

**Location**: [`contracts/contracts/airdrop/`](../../contracts/contracts/airdrop/)

**Source Files**:
- [`src/lib.rs`](../../contracts/contracts/airdrop/src/lib.rs) - Module exports and documentation
- [`src/contract.rs`](../../contracts/contracts/airdrop/src/contract.rs) - Main contract logic
- [`src/msg.rs`](../../contracts/contracts/airdrop/src/msg.rs) - Message definitions
- [`src/state.rs`](../../contracts/contracts/airdrop/src/state.rs) - State management
- [`src/error.rs`](../../contracts/contracts/airdrop/src/error.rs) - Error types

**Deployed Contract Addresses**:
- Mainnet (columbus-5): `terra1m758wqc6grg7ttg8cmrp72hf6a5cej5zq0w59d9d6wr5r22tulwqk3ga5r`
- Code ID: `10700`

**Description**: Batch distribution of CW20 tokens to multiple recipients in a single transaction, similar to [disperse.app](https://disperse.app). Used primarily for preregistration USTR distribution but can be used for any CW20 token distribution.

**Execute Messages**:
- `Airdrop` - Distributes CW20 tokens to multiple recipients

**Query Messages**:
- `Config` - Returns contract configuration

**Key Development Decisions**:

1. **Atomic Execution**: If any individual transfer fails, the entire airdrop fails and is rolled back. This ensures all-or-nothing distribution.

2. **No Maximum Recipients**: The only limit is the TerraClassic block gas limit. This allows large distributions in a single transaction.

3. **Caller Pays Gas**: The user initiating the airdrop pays all gas fees, making it suitable for protocol-managed distributions.

4. **Standard CW20 Allowance**: Uses standard CW20 allowance mechanism. Sender must approve the contract before calling `Airdrop`.

5. **Any CW20 Token**: Can distribute any CW20 token, not just USTR. Makes the contract reusable for future distributions.

**Use Case**: Primary use is distributing USTR to preregistration participants. Admin prepares recipient list, approves USTR spending, then executes single airdrop transaction.

**Full Specification**: See [PROPOSAL.md](../PROPOSAL.md#airdrop-contract) for complete interface details.

---

## Referral Contract

**Location**: [`contracts/contracts/referral/`](../../contracts/contracts/referral/)

**Source Files**:
- [`src/lib.rs`](../../contracts/contracts/referral/src/lib.rs) - Module exports and documentation
- [`src/contract.rs`](../../contracts/contracts/referral/src/contract.rs) - Main contract logic
- [`src/msg.rs`](../../contracts/contracts/referral/src/msg.rs) - Message definitions
- [`src/state.rs`](../../contracts/contracts/referral/src/state.rs) - State management
- [`src/error.rs`](../../contracts/contracts/referral/src/error.rs) - Error types

**Description**: Enables referral code registration for viral growth incentives. Users burn 10 USTR to register a unique code. When new users include a valid referral code during swaps, both the swapper (+10% USTR) and the code owner (+10% USTR) receive bonuses.

**Key Properties**:
- **No admin**: Contract has no configurable parameters and no admin
- **Fixed fee**: 10 USTR burned per registration (permanently fixed, non-adjustable)
- **No dependencies**: Other contracts query this one; it doesn't call others

**Code Registration Rules**:
| Constraint | Value |
|------------|-------|
| Minimum length | 1 character |
| Maximum length | 20 characters |
| Allowed characters | `a-z0-9_-` (lowercase alphanumeric, underscore, hyphen) |
| Case sensitivity | Case-insensitive (input normalized to lowercase) |
| Registration cost | 10 USTR (burned) |
| Uniqueness | First-come, first-served |
| Max codes per account | 10 codes (prevents spam registration from a single wallet) |

**Execute Messages**:
- `Receive(Cw20ReceiveMsg)` - CW20 receive hook; processes `RegisterCode { code }` by burning 10 USTR

**Registration Flow**:
1. User calls USTR token: `Send { contract: referral_addr, amount: 10_000_000_000_000_000_000, msg: RegisterCode { code: "my-code_1" } }`
2. Referral contract receives USTR via CW20 hook
3. Validates code format (1-20 chars, a-z0-9_- only)
4. Checks code is not already registered
5. Burns the 10 USTR
6. Stores code → owner mapping
7. If any step fails, transaction reverts and USTR is returned

**Query Messages**:
- `Config {}` - Returns USTR token address
- `CodeInfo { code }` - Returns owner address if code exists (case-insensitive lookup)
- `CodesByOwner { owner }` - Returns all codes owned by an address
- `ValidateCode { code }` - Returns format validity and registration status (used by Swap contract)

**Key Development Decisions**:

1. **No Admin**: Contract is fully autonomous with no configurable parameters. The 10 USTR fee is permanently fixed. This maximizes trustlessness.

2. **Case-Insensitive**: Codes are normalized to lowercase before storage and lookup. "MyCode" and "mycode" are the same code.

3. **URL-Safe Characters**: Only `a-z0-9_-` are allowed, making codes safe for referral URLs (e.g., `swap.ust1.cl8y.com/my-code_1`).

4. **Burn on Register**: The 10 USTR is permanently burned, not transferred to any address. This creates deflationary pressure.

5. **CW20 Send Pattern**: Uses standard CW20 `Send` + receive hook pattern for atomic burn-and-register.

6. **Self-Referral Allowed**: Users may use their own referral codes during swaps, receiving the full 20% bonus. This rewards users who understand and engage with the system.

**Economic Rationale**:
- 10 USTR cost prevents spam/squatting
- Burns USTR supply (deflationary)
- Pays for itself after referring ~1 swap (10% of 100+ USTR = 10+ USTR)
- Creates viral growth incentive

**Full Specification**: See [PROPOSAL.md](../PROPOSAL.md#referral-contract) for complete interface details.

---

## Common Types

**Location**: [`contracts/packages/common/src/asset.rs`](../../contracts/packages/common/src/asset.rs)

**Description**: Shared type definitions used across multiple contracts.

**Types**:
- `AssetInfo` - Enum representing either native token (by denomination) or CW20 token (by contract address)
- `Asset` - Struct combining `AssetInfo` with amount

**Usage**: Used by Treasury and Swap contracts for unified asset handling.

---

## Decimal Handling

The CMM system handles tokens with varying decimal configurations:

| Token Type | Typical Decimals | Example |
|------------|------------------|---------|
| Native `uusd` | 6 | 1 USTC = 1,000,000 uusd |
| CW20 Mintable | 18 | 1 USTR = 10^18 base units |
| Other CW20s | Varies | Checked on-chain |

**CR Calculation**: The system queries each token's on-chain decimal count and normalizes all values before calculating collateralization ratios. This ensures oracle prices (typically in USD per whole token) match the internal accounting regardless of decimal configuration.

---

## On-Chain Tax Handling

TerraClassic applies a **0.5% Burn Tax** on native token transfers via `BankMsg::Send`. This tax is queried via `/terra/tx/v1beta1/compute_tax`.

### Tax Behavior by Transaction Type

| Transaction Type | Tax Applied |
|------------------|-------------|
| `MsgSend` (wallet → wallet) | ✅ 0.5% tax |
| `MsgExecuteContract` with funds (user → contract) | ❌ No tax |
| `BankMsg::Send` from contract (contract → wallet/contract) | ✅ 0.5% tax |

### Swap Architecture & Tax

Users call `Swap {}` on the Swap contract with USTC attached. The flow:

1. **User → Swap Contract**: via `MsgExecuteContract` → **No tax**
2. **Swap Contract → Treasury**: via `BankMsg::Send` → **0.5% tax (user pays)**
3. **Swap Contract mints USTR**: calculated on **pre-tax amount**

**User Pays Tax**: The 0.5% burn tax is deducted when the Swap contract forwards USTC to Treasury. However, USTR is calculated on the original (pre-tax) amount, so users receive full USTR value.

**Tax Trade-off**: The 0.5% tax cost is offset by:
- Up to 20% referral bonus when using valid codes
- Ecosystem benefit (burned USTC is permanently removed from supply)

**Atomic Guarantees**: All operations execute in the same transaction. If any step fails (swap paused, period ended, invalid referral code, mint fails), the entire transaction reverts and the user's USTC is returned.

### Preregistration Transfer

When transferring USTC from the preregistration contract to treasury via `BankMsg::Send`, the 0.5% burn tax applies:
- Preregistration contract holds USTC
- Treasury receives 99.5% (0.5% burned)
- CR calculations account for the actual received amount
- The burn tax reduces circulating USTC supply (ecosystem benefit)

---

## Contract Immutability

All contracts are deployed as **immutable** (no proxy or migration pattern). This design choice:

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

---

## Development References

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

**cw20-mintable**: Use as reference for CosmWasm smart contract development on TerraClassic
- `src/contract.rs` - Entry points, execute/query handlers
- `src/state.rs` - State management with cw-storage-plus
- `src/msg.rs` - Message definitions with cosmwasm-schema
- `src/error.rs` - Custom error types with thiserror

**cmm-ustc-preregister**: Use as reference for full-stack TerraClassic dapp development
- `smartcontracts-terraclassic/` - CosmWasm contracts with tests and deployment scripts
- `frontend-dapp/` - React + TypeScript frontend with wallet integration

---

## Testing

All contracts include comprehensive test suites with 100% code coverage. Tests are located alongside source code in each contract's `src/` directory.

**Running Tests**:
```bash
# Test all contracts
cd contracts
cargo test --workspace

# Test specific contract
cargo test --package treasury --lib
cargo test --package ustc-swap --lib
cargo test --package airdrop --lib
cargo test --package referral --lib
```

**Test Coverage**: Each contract maintains 100% test coverage including:
- Unit tests for all functions
- Edge case handling
- Error conditions
- Integration tests for multi-contract interactions

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions and contract addresses.
