//! Message types for the USTC Swap contract

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Decimal, Timestamp, Uint128};
use common::AssetInfo;

/// Instantiate message
#[cw_serde]
pub struct InstantiateMsg {
    /// USTR contract address
    pub ustr_token: String,
    /// Treasury contract address
    pub treasury: String,
    /// Unix epoch timestamp when swap period begins
    pub start_time: u64,
    /// Starting exchange rate (1.5)
    pub start_rate: Decimal,
    /// Ending exchange rate (2.5)
    pub end_rate: Decimal,
    /// Swap duration in seconds (8,640,000 for 100 days)
    pub duration_seconds: u64,
    /// Admin address for emergencies
    pub admin: String,
}

/// Execute messages
#[cw_serde]
pub enum ExecuteMsg {
    /// Accepts USTC (uusd, sent as native funds; minimum 1 USTC), mints USTR to sender
    Swap {},

    /// Pauses swap functionality (admin only)
    EmergencyPause {},

    /// Resumes swap functionality (admin only)
    EmergencyResume {},

    /// Initiates 7-day timelock for admin transfer
    ProposeAdmin { new_admin: String },

    /// Completes admin transfer after timelock
    AcceptAdmin {},

    /// Cancels pending admin change
    CancelAdminProposal {},

    /// Recovers stuck native or CW20 assets (admin only, after swap period ends)
    RecoverAsset {
        asset: AssetInfo,
        amount: Uint128,
        recipient: String,
    },
}

/// Query messages
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Returns all contract configuration
    #[returns(ConfigResponse)]
    Config {},

    /// Returns current USTC/USTR exchange rate
    #[returns(RateResponse)]
    CurrentRate {},

    /// Returns USTR amount for given USTC
    #[returns(SimulationResponse)]
    SwapSimulation { ustc_amount: Uint128 },

    /// Returns active/ended status, time remaining
    #[returns(StatusResponse)]
    Status {},

    /// Returns total USTC received, total USTR minted
    #[returns(StatsResponse)]
    Stats {},

    /// Returns pending admin proposal details
    #[returns(Option<PendingAdminResponse>)]
    PendingAdmin {},
}

/// Response for Config query
#[cw_serde]
pub struct ConfigResponse {
    pub ustr_token: Addr,
    pub treasury: Addr,
    pub start_time: Timestamp,
    pub end_time: Timestamp,
    pub start_rate: Decimal,
    pub end_rate: Decimal,
    pub admin: Addr,
    pub paused: bool,
}

/// Response for CurrentRate query
#[cw_serde]
pub struct RateResponse {
    /// Current USTC per USTR rate
    pub rate: Decimal,
    /// Seconds elapsed since start
    pub elapsed_seconds: u64,
    /// Total duration in seconds
    pub total_seconds: u64,
}

/// Response for SwapSimulation query
#[cw_serde]
pub struct SimulationResponse {
    /// USTC amount being swapped
    pub ustc_amount: Uint128,
    /// USTR amount to receive
    pub ustr_amount: Uint128,
    /// Rate used for calculation
    pub rate: Decimal,
}

/// Response for Status query
#[cw_serde]
pub struct StatusResponse {
    /// Whether the swap is currently active
    pub is_active: bool,
    /// Whether the swap period has started
    pub has_started: bool,
    /// Whether the swap period has ended
    pub has_ended: bool,
    /// Whether the swap is paused
    pub is_paused: bool,
    /// Seconds remaining until end (0 if ended)
    pub seconds_remaining: u64,
    /// Seconds until start (0 if started)
    pub seconds_until_start: u64,
}

/// Response for Stats query
#[cw_serde]
pub struct StatsResponse {
    pub total_ustc_received: Uint128,
    pub total_ustr_minted: Uint128,
}

/// Response for PendingAdmin query
#[cw_serde]
pub struct PendingAdminResponse {
    pub new_address: Addr,
    pub execute_after: Timestamp,
}

