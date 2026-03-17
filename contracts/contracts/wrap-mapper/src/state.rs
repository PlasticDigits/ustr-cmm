use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Timestamp, Uint128};
use cw_storage_plus::{Item, Map};

pub const CONTRACT_NAME: &str = "crates.io:wrap-mapper";
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 7 days in seconds
pub const GOVERNANCE_TIMELOCK: u64 = 604_800;

#[cw_serde]
pub struct Config {
    pub governance: Addr,
    pub treasury: Addr,
    pub paused: bool,
    /// Fee in basis points charged on wrap/unwrap (e.g. 50 = 0.5%).
    /// Fee remains in treasury as native token profit.
    pub fee_bps: u16,
}

pub const MAX_FEE_BPS: u16 = 1000; // 10% hard cap

/// Minimum fee in basis points. Must be set >= chain tax rate to ensure
/// treasury solvency: each unwrap triggers a BankMsg::Send whose tax is
/// deducted from treasury reserves. The wrapping fee must cover this tax
/// or the treasury's native balance will erode below outstanding CW20 supply.
pub const MIN_FEE_BPS: u16 = 1;

#[cw_serde]
pub struct PendingGovernance {
    pub new_address: Addr,
    pub execute_after: Timestamp,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const PENDING_GOVERNANCE: Item<PendingGovernance> = Item::new("pending_governance");

/// Maps native denom (e.g. "uluna") to the CW20 contract address
pub const DENOM_TO_CW20: Map<&str, Addr> = Map::new("denom_to_cw20");

/// Reverse map: CW20 contract address -> native denom
pub const CW20_TO_DENOM: Map<&str, String> = Map::new("cw20_to_denom");

#[cw_serde]
pub struct RateLimitConfig {
    pub max_amount_per_window: Uint128,
    pub window_seconds: u64,
}

#[cw_serde]
pub struct RateLimitState {
    pub current_window_start: Timestamp,
    pub amount_used: Uint128,
}

/// Rate limit configuration per denom
pub const RATE_LIMITS: Map<&str, RateLimitConfig> = Map::new("rate_limits");

/// Current rate limit window state per denom
pub const RATE_LIMIT_STATE: Map<&str, RateLimitState> = Map::new("rate_limit_state");
