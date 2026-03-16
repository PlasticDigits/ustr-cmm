use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Timestamp, Uint128};
use cw20::Cw20ReceiveMsg;

use crate::state::RateLimitConfig;

#[cw_serde]
pub struct InstantiateMsg {
    pub governance: String,
    pub treasury: String,
    /// Fee in basis points charged on wrap/unwrap (e.g. 50 = 0.5%).
    /// Defaults to 50 if not provided.
    pub fee_bps: Option<u16>,
}

#[cw_serde]
pub struct MigrateMsg {}

#[cw_serde]
pub enum ExecuteMsg {
    /// Called by treasury after a user's WrapDeposit. Mints CW20 to depositor.
    NotifyDeposit {
        depositor: String,
        denom: String,
        amount: Uint128,
    },

    /// CW20 receive hook for unwrapping
    Receive(Cw20ReceiveMsg),

    /// Sets a denom->CW20 mapping (governance-only)
    SetDenomMapping {
        denom: String,
        cw20_addr: String,
    },

    /// Removes a denom mapping (governance-only)
    RemoveDenomMapping {
        denom: String,
    },

    /// Sets rate limit for a denom (governance-only)
    SetRateLimit {
        denom: String,
        config: RateLimitConfig,
    },

    /// Removes rate limit for a denom (governance-only)
    RemoveRateLimit {
        denom: String,
    },

    /// Proposes governance transfer with 7-day timelock (governance-only)
    ProposeGovernanceTransfer {
        new_governance: String,
    },

    /// Accepts a pending governance transfer after timelock (new governance only)
    AcceptGovernanceTransfer {},

    /// Cancels a pending governance transfer (governance-only)
    CancelGovernanceTransfer {},

    /// Pauses or unpauses the contract (governance-only)
    SetPaused {
        paused: bool,
    },

    /// Updates the fee in basis points (governance-only, max 1000 = 10%)
    SetFeeBps {
        fee_bps: u16,
    },
}

#[cw_serde]
pub enum Cw20HookMsg {
    Unwrap { recipient: Option<String> },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ConfigResponse)]
    Config {},

    #[returns(DenomMappingResponse)]
    DenomMapping { denom: String },

    #[returns(AllDenomMappingsResponse)]
    AllDenomMappings {},

    #[returns(RateLimitResponse)]
    RateLimit { denom: String },

    #[returns(PendingGovernanceResponse)]
    PendingGovernance {},
}

#[cw_serde]
pub struct ConfigResponse {
    pub governance: Addr,
    pub treasury: Addr,
    pub paused: bool,
    pub fee_bps: u16,
}

#[cw_serde]
pub struct PendingGovernanceResponse {
    pub new_governance: Option<Addr>,
    pub execute_after: Option<Timestamp>,
}

#[cw_serde]
pub struct DenomMappingResponse {
    pub denom: String,
    pub cw20_addr: Addr,
}

#[cw_serde]
pub struct DenomMappingEntry {
    pub denom: String,
    pub cw20_addr: Addr,
}

#[cw_serde]
pub struct AllDenomMappingsResponse {
    pub mappings: Vec<DenomMappingEntry>,
}

#[cw_serde]
pub struct RateLimitResponse {
    pub config: Option<RateLimitConfig>,
    pub current_window_start: Option<Timestamp>,
    pub amount_used: Uint128,
}

/// Message sent to the treasury for instant withdrawal
#[cw_serde]
pub enum TreasuryExecuteMsg {
    InstantWithdraw {
        recipient: String,
        denom: String,
        amount: Uint128,
    },
}
