//! Message types for the Treasury contract

use common::AssetInfo;
use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Timestamp, Uint128};

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
    ProposeGovernance { new_governance: String },

    /// Completes governance transfer after timelock expires
    /// Only callable by pending governance address
    AcceptGovernance {},

    /// Cancels pending governance change
    /// Only callable by current governance
    CancelGovernanceProposal {},

    /// Transfers assets from treasury
    /// Only callable by governance
    Withdraw {
        destination: String,
        asset: AssetInfo,
        amount: Uint128,
    },

    /// Adds a CW20 token to the balance tracking whitelist
    /// Only callable by governance
    AddCw20 { contract_addr: String },

    /// Removes a CW20 token from the whitelist
    /// Only callable by governance
    RemoveCw20 { contract_addr: String },
}

/// Query messages
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Returns current governance and timelock settings
    #[returns(ConfigResponse)]
    Config {},

    /// Returns pending governance proposal details
    #[returns(Option<PendingGovernanceResponse>)]
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
}

/// Response for Config query
#[cw_serde]
pub struct ConfigResponse {
    pub governance: Addr,
    pub timelock_duration: u64,
}

/// Response for PendingGovernance query
#[cw_serde]
pub struct PendingGovernanceResponse {
    pub new_address: Addr,
    pub execute_after: Timestamp,
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

