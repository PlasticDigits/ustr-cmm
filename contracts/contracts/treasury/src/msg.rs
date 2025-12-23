//! Message types for the Treasury contract

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

    /// CW20 receive hook - accepts direct CW20 token transfers
    /// Called automatically when CW20 tokens are sent to this contract
    Receive(Cw20ReceiveMsg),
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
}

/// Response for Config query
#[cw_serde]
pub struct ConfigResponse {
    pub governance: Addr,
    pub timelock_duration: u64,
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

