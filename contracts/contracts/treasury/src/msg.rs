//! Message types for the Treasury contract

use crate::state::Cw20PullLimitConfig;
use common::AssetInfo;
use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Timestamp, Uint128};
use cw20::Cw20ReceiveMsg;

/// Instantiate message
#[cw_serde]
pub struct InstantiateMsg {
    /// Initial governance address (deployer's admin wallet)
    pub governance: String,
}

/// Migrate message (empty for now, can be extended for future migrations)
#[cw_serde]
pub struct MigrateMsg {}

/// Execute messages
#[cw_serde]
pub enum ExecuteMsg {
    /// Initiates 7-day timelock for governance transfer
    /// Only callable by current governance
    ProposeGovernanceTransfer { new_governance: String },

    /// Completes governance transfer after timelock expires
    /// Only callable by pending governance address
    AcceptGovernanceTransfer {},

    /// Cancels a specific pending governance transfer
    /// Only callable by current governance
    CancelGovernanceTransfer { proposed_governance: String },

    /// Proposes a withdrawal with 7-day timelock
    /// Only callable by governance
    ProposeWithdraw {
        destination: String,
        asset: AssetInfo,
        amount: Uint128,
    },

    /// Executes a pending withdrawal after timelock expires
    /// Only callable by governance
    ExecuteWithdraw { withdrawal_id: String },

    /// Cancels a specific pending withdrawal
    /// Only callable by governance
    CancelWithdraw { withdrawal_id: String },

    /// Adds a CW20 token to the balance tracking whitelist
    /// Only callable by governance
    AddCw20 { contract_addr: String },

    /// Removes a CW20 token from the whitelist
    /// Only callable by governance
    RemoveCw20 { contract_addr: String },

    /// Sets the authorized swap contract address for deposit notifications
    /// Only callable by governance
    SetSwapContract { contract_addr: String },

    /// Accepts USTC deposits for swap (tax-optimized)
    /// Users send USTC directly to Treasury via MsgExecuteContract (no tax)
    /// Treasury notifies swap contract to mint USTR to depositor
    /// Minimum deposit: 1 USTC (1,000,000 uusd)
    SwapDeposit {},

    /// CW20 receive hook - accepts direct CW20 token transfers
    /// Called automatically when CW20 tokens are sent to this contract
    Receive(Cw20ReceiveMsg),

    /// Registers a wrapper contract for a native denom (governance-only)
    SetDenomWrapper { denom: String, wrapper: String },

    /// Removes the wrapper registration for a native denom (governance-only)
    RemoveDenomWrapper { denom: String },

    /// Accepts native token deposits for wrapping (anyone).
    /// Native tokens stay in treasury; wrapper is notified to mint CW20.
    WrapDeposit {},

    /// Allows a registered wrapper to withdraw assets to a recipient.
    /// Caller must be the registered wrapper for the denom being withdrawn.
    InstantWithdraw {
        recipient: String,
        denom: String,
        amount: Uint128,
    },

    /// Pauses or unpauses wrapping operations (WrapDeposit / InstantWithdraw).
    /// Only callable by governance.
    SetWrappingPaused { paused: bool },

    /// Registers (or replaces) the sole spender allowed to pull a CW20 token
    /// via `InstantWithdrawCw20`. Governance-only. No timelock (same as
    /// `SetDenomWrapper`). Register only audited contracts (e.g. ust1-window).
    ///
    /// If `limit_24h` is `Some`, also sets the tumbling 24h pull limit for
    /// `(token, spender)`. If `None`, existing limit for the new pair is left
    /// unchanged (pulls fail-closed until `SetCw20SpenderLimit`).
    SetCw20Spender {
        token: String,
        spender: String,
        limit_24h: Option<Uint128>,
    },

    /// Removes the CW20 spender registration for a token. Governance-only.
    /// Also clears pull-limit config/usage for the removed `(token, spender)`.
    RemoveCw20Spender { token: String },

    /// Sets or updates the 24h InstantWithdrawCw20 pull limit for a
    /// `(spender, token)` pair. Governance-only. No timelock.
    SetCw20SpenderLimit {
        token: String,
        spender: String,
        limit_24h: Uint128,
    },

    /// Removes the 24h pull limit for a `(spender, token)` pair (fail-closed:
    /// subsequent InstantWithdrawCw20 for that pair is denied until reset).
    /// Governance-only.
    RemoveCw20SpenderLimit { token: String, spender: String },

    /// Pauses or unpauses CW20 InstantWithdraw. Independent of `wrapping_paused`.
    /// Only callable by governance.
    SetCw20InstantWithdrawPaused { paused: bool },

    /// Allows a registered CW20 spender to transfer treasury-held CW20 to a
    /// recipient (no allowance required). Caller must equal `CW20_SPENDERS[token]`.
    /// Not gated by `wrapping_paused`. Enforces the per-(spender, token) 24h
    /// pull limit (fail-closed if unset).
    InstantWithdrawCw20 {
        recipient: String,
        token: String,
        amount: Uint128,
    },
}

/// Query messages
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Returns current governance and timelock settings
    #[returns(ConfigResponse)]
    Config {},

    /// Returns all pending governance proposals
    #[returns(PendingGovernanceResponse)]
    PendingGovernance {},

    /// Returns treasury balance for specified asset
    #[returns(BalanceResponse)]
    Balance { asset: AssetInfo },

    /// Returns all treasury holdings (native + whitelisted CW20s)
    #[returns(AllBalancesResponse)]
    AllBalances {},

    /// Returns list of whitelisted CW20 contract addresses
    #[returns(Cw20WhitelistResponse)]
    Cw20Whitelist {},

    /// Returns all pending withdrawal proposals
    #[returns(PendingWithdrawalsResponse)]
    PendingWithdrawals {},

    /// Returns all denom->wrapper mappings
    #[returns(DenomWrappersResponse)]
    DenomWrappers {},

    /// Returns all CW20 token→spender mappings for InstantWithdrawCw20
    #[returns(Cw20SpendersResponse)]
    Cw20Spenders {},

    /// Returns 24h pull-limit config + tumbling-window usage for a pair
    #[returns(Cw20SpenderLimitResponse)]
    Cw20SpenderLimit { token: String, spender: String },
}

/// Response for Config query
#[cw_serde]
pub struct ConfigResponse {
    pub governance: Addr,
    pub timelock_duration: u64,
    pub swap_contract: Option<Addr>,
    pub wrapping_paused: bool,
    /// Pause flag for `InstantWithdrawCw20` only (independent of wrapping_paused)
    pub cw20_instant_withdraw_paused: bool,
}

/// A single pending governance proposal entry
#[cw_serde]
pub struct PendingGovernanceEntry {
    pub new_address: Addr,
    pub execute_after: Timestamp,
}

/// Response for PendingGovernance query - returns all pending proposals
#[cw_serde]
pub struct PendingGovernanceResponse {
    pub proposals: Vec<PendingGovernanceEntry>,
}

/// Response for Balance query
#[cw_serde]
pub struct BalanceResponse {
    pub asset: AssetInfo,
    pub amount: Uint128,
}

/// Asset balance entry for AllBalances response
#[cw_serde]
pub struct AssetBalance {
    pub asset: AssetInfo,
    pub amount: Uint128,
}

/// Response for AllBalances query
#[cw_serde]
pub struct AllBalancesResponse {
    pub balances: Vec<AssetBalance>,
}

/// Response for Cw20Whitelist query
#[cw_serde]
pub struct Cw20WhitelistResponse {
    pub addresses: Vec<Addr>,
}

/// A single pending withdrawal entry
#[cw_serde]
pub struct PendingWithdrawalEntry {
    pub withdrawal_id: String,
    pub destination: Addr,
    pub asset: AssetInfo,
    pub amount: Uint128,
    pub execute_after: Timestamp,
}

/// Response for PendingWithdrawals query - returns all pending withdrawals
#[cw_serde]
pub struct PendingWithdrawalsResponse {
    pub withdrawals: Vec<PendingWithdrawalEntry>,
}

/// A single denom->wrapper mapping entry
#[cw_serde]
pub struct DenomWrapperEntry {
    pub denom: String,
    pub wrapper: Addr,
}

/// Response for DenomWrappers query
#[cw_serde]
pub struct DenomWrappersResponse {
    pub wrappers: Vec<DenomWrapperEntry>,
}

/// A single CW20 token→spender mapping entry
#[cw_serde]
pub struct Cw20SpenderEntry {
    pub token: Addr,
    pub spender: Addr,
}

/// Response for Cw20Spenders query
#[cw_serde]
pub struct Cw20SpendersResponse {
    pub spenders: Vec<Cw20SpenderEntry>,
}

/// Response for Cw20SpenderLimit query
#[cw_serde]
pub struct Cw20SpenderLimitResponse {
    /// Absent when no limit is configured (fail-closed for pulls)
    pub config: Option<Cw20PullLimitConfig>,
    pub current_window_start: Option<Timestamp>,
    pub amount_used: Uint128,
    /// `limit - amount_used` in the active window; zero when unset or exhausted
    pub remaining: Uint128,
    /// Unix seconds when the current tumbling window resets (if usage exists)
    pub reset_at: Option<u64>,
}

/// Message sent to wrapper contract to notify of a wrap deposit.
/// Matches the wrap-mapper's ExecuteMsg::NotifyDeposit variant.
#[cw_serde]
pub enum WrapperExecuteMsg {
    NotifyDeposit {
        depositor: String,
        denom: String,
        amount: Uint128,
    },
}

