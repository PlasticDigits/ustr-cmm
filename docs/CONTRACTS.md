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
- `AcceptGovernanceTransfer {}` - Completes governance transfer for sender's address after timelock expires; clears all other pending proposals
- `CancelGovernanceTransfer { proposed_governance }` - Cancels a specific pending governance proposal
- `ProposeWithdraw { destination, asset, amount }` - Proposes a withdrawal with 7-day timelock (governance only)
- `ExecuteWithdraw { withdrawal_id }` - Executes a pending withdrawal after timelock expires (governance only)
- `CancelWithdraw { withdrawal_id }` - Cancels a specific pending withdrawal (governance only)
- `AddCw20 { contract_addr }` - Adds CW20 token to balance tracking whitelist
- `RemoveCw20 { contract_addr }` - Removes CW20 token from whitelist
- `Receive(Cw20ReceiveMsg)` - CW20 receive hook for accepting direct token transfers

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

6. **Multiple Pending Proposals**: Multiple governance proposals can exist simultaneously. Each proposed address has its own timelock. When any proposal is accepted, all other pending proposals are automatically cleared since governance has changed.

7. **Decimal Handling**: System uses each token's on-chain decimal count when calculating CR ratios, ensuring oracle prices match regardless of decimal configuration (6 for native `uusd`, 18 for most CW20s, etc.).

8. **Governance Transition Plan**: In Phase 1, governance is a single admin EOA. Phase 2 will transfer governance to a multi-sig with additional security measures. Phase 3+ will implement full DAO governance with on-chain voting. The treasury contract implements withdrawal timelocks directly, providing security at the contract level regardless of the governance mechanism.

**Security Features**:
- Governance changes require 7-day waiting period
- Withdrawals require 7-day waiting period
- Current governance can cancel pending transfers and withdrawals
- All actions emit events for transparency
- No direct access to assets except via explicit withdrawal proposals

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

**Description**: Time-limited, one-way exchange mechanism that allows users to convert USTC into USTR at a rate that increases over 100 days, incentivizing early participation.

**Economic Parameters**:
- Start rate: 1.5 USTC per 1 USTR
- End rate: 2.5 USTC per 1 USTR
- Duration: 100 days (8,640,000 seconds)
- Rate updates: Continuous (calculated per-second)
- Post-duration: No further USTR issuance

**Execute Messages**:
- `Swap` - Accepts USTC (sent as native funds), mints USTR to sender
- `EmergencyPause` - Pauses swap functionality (admin only)
- `EmergencyResume` - Resumes swap functionality (admin only)
- `ProposeAdmin` - Initiates 7-day timelock for admin transfer
- `AcceptAdmin` - Completes admin transfer after timelock
- `CancelAdminProposal` - Cancels pending admin change
- `RecoverAsset` - Recovers stuck assets (available after swap period ends)

**Query Messages**:
- `Config` - Returns all contract configuration
- `CurrentRate` - Returns current USTC/USTR exchange rate
- `SwapSimulation` - Returns USTR amount for given USTC
- `Status` - Returns active/ended status, time remaining
- `Stats` - Returns total USTC received, total USTR minted
- `PendingAdmin` - Returns pending admin proposal details

**Key Development Decisions**:

1. **Linear Rate Progression**: Rate follows linear interpolation: `rate(t) = start_rate + ((end_rate - start_rate) * elapsed_seconds / total_seconds)`. This creates a Schelling point attractor that encourages early adoption.

2. **High Precision Calculations**: Uses CosmWasm's `Decimal` type (10^18 precision) for intermediate calculations to avoid rounding errors at per-second granularity.

3. **Floor Rounding**: Final USTR amounts use floor rounding to favor the protocol and prevent rounding exploits.

4. **Minimum Swap Amount**: Swaps less than 1 USTC (1,000,000 micro units) are rejected to prevent dust attacks. At ~$0.02 per USTC, executing 1M spam transactions would cost $20,000+, exceeding exploit profit.

5. **Atomic Execution**: Entire swap operation (USTC transfer → USTR mint) happens atomically. If any step fails, entire transaction rolls back.

6. **Native Token Only**: Contract only accepts `uusd` native denomination. Rejects LUNC or other native tokens to prevent confusion.

7. **Permanent Disable**: After 100 days, contract is permanently disabled. No reactivation possible. Admin can only recover stuck assets.

8. **Emergency Pause**: Admin can pause swaps while queries remain available, allowing users to check rates and status during emergencies.

9. **7-Day Admin Timelock**: Admin address changes require 7-day timelock (same as treasury governance) for security.

10. **Burn Tax Handling**: TerraClassic's USTC burn tax applies to transfers. Treasury receives post-tax amount, which is accounted for in CR calculations.

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

TerraClassic applies a **USTC Burn Tax** on `uusd` transfers. Per the [official TerraClassic tax documentation](https://terra-classic.io/docs/develop/module-specifications/tax):

- `ComputeTax()` multiplies each spend coin by `BurnTaxRate` and truncates to integers
- Zero results skip deduction
- The treasury receives the **post-tax amount** when USTC is transferred

**Impact on CMM**:
- When transferring USTC from preregistration to treasury, the burn tax applies
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
```

**Test Coverage**: Each contract maintains 100% test coverage including:
- Unit tests for all functions
- Edge case handling
- Error conditions
- Integration tests for multi-contract interactions

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions and contract addresses.
