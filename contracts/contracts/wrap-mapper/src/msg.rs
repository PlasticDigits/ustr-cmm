use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Timestamp, Uint128};
use cw20::Cw20ReceiveMsg;

use crate::state::RateLimitConfig;

#[cw_serde]
pub struct InstantiateMsg {
    pub governance: String,
    pub treasury: String,
    /// Wrap fee in basis points (e.g. 200 = 2%). Defaults to 50 if omitted.
    pub fee_wrap_bps: Option<u16>,
    /// Unwrap fee in basis points. Defaults to 50 if omitted.
    /// Independent of wrap; may be below burn tax under [#9](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/9).
    pub fee_unwrap_bps: Option<u16>,
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

    /// Updates wrap fee only (governance-only, max 1000 = 10%)
    SetFeeWrapBps {
        fee_wrap_bps: u16,
    },

    /// Updates unwrap fee only (governance-only, max 1000 = 10%)
    SetFeeUnwrapBps {
        fee_unwrap_bps: u16,
    },

    /// Updates both wrap and unwrap fees atomically (governance-only)
    SetFees {
        fee_wrap_bps: u16,
        fee_unwrap_bps: u16,
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

/// Breaking vs pre-#9: `fee_bps` removed; clients must read `fee_wrap_bps` /
/// `fee_unwrap_bps`. Coordinated with DEX consumer [#516](https://gitlab.com/PlasticDigits/cl8y-dex-terraclassic/-/work_items/516).
#[cw_serde]
pub struct ConfigResponse {
    pub governance: Addr,
    pub treasury: Addr,
    pub paused: bool,
    pub fee_wrap_bps: u16,
    pub fee_unwrap_bps: u16,
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
