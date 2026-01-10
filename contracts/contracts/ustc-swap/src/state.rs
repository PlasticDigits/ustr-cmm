//! State definitions for the USTC Swap contract

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Decimal, Timestamp, Uint128};
use cw_storage_plus::Item;

/// Contract configuration
#[cw_serde]
pub struct Config {
    /// Address of the USTR CW20 contract
    pub ustr_token: Addr,
    /// Address of the treasury contract (destination for USTC)
    pub treasury: Addr,
    /// Address of the referral contract (for code validation)
    pub referral: Addr,
    /// Unix timestamp when swap period begins
    pub start_time: Timestamp,
    /// Unix timestamp when swap period ends
    pub end_time: Timestamp,
    /// Initial USTC/USTR rate (1.5)
    pub start_rate: Decimal,
    /// Final USTC/USTR rate (2.5)
    pub end_rate: Decimal,
    /// Admin address for emergency operations
    pub admin: Addr,
    /// Whether swap is currently paused
    pub paused: bool,
}

/// Pending admin change proposal
#[cw_serde]
pub struct PendingAdmin {
    /// Proposed new admin address
    pub new_address: Addr,
    /// Block time when the change can be executed
    pub execute_after: Timestamp,
}

/// Swap statistics
#[cw_serde]
pub struct Stats {
    /// Cumulative USTC deposited (pre-tax amount)
    pub total_ustc_received: Uint128,
    /// Cumulative USTR issued (including referral bonuses)
    pub total_ustr_minted: Uint128,
    /// Total USTR minted as referral bonuses (user + referrer combined)
    pub total_referral_bonus_minted: Uint128,
    /// Count of swaps that used valid referral codes
    pub total_referral_swaps: u64,
}

/// Contract name for cw2 migration info
pub const CONTRACT_NAME: &str = "crates.io:ustc-swap";
/// Contract version for cw2 migration info
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 7 days in seconds for admin change timelock
pub const ADMIN_TIMELOCK_DURATION: u64 = 604_800;

/// 100 days in seconds for swap duration
pub const DEFAULT_SWAP_DURATION: u64 = 8_640_000;

/// Minimum swap amount: 1 USTC = 1,000,000 uusd
pub const MIN_SWAP_AMOUNT: u128 = 1_000_000;

/// USTC denomination on TerraClassic
pub const USTC_DENOM: &str = "uusd";

/// Referral bonus percentage (10% = 10 out of 100)
pub const REFERRAL_BONUS_NUMERATOR: u128 = 10;
pub const REFERRAL_BONUS_DENOMINATOR: u128 = 100;

/// Primary config storage
pub const CONFIG: Item<Config> = Item::new("config");

/// Pending admin proposal (if any)
pub const PENDING_ADMIN: Item<PendingAdmin> = Item::new("pending_admin");

/// Swap statistics
pub const STATS: Item<Stats> = Item::new("stats");

