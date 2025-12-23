//! State definitions for the Treasury contract

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Timestamp};
use cw_storage_plus::{Item, Map};

/// Contract configuration
#[cw_serde]
pub struct Config {
    /// Current governance address (admin/DAO)
    pub governance: Addr,
    /// Duration of governance change delay in seconds (7 days = 604,800)
    pub timelock_duration: u64,
    /// Authorized swap contract address for deposit notifications (optional)
    pub swap_contract: Option<Addr>,
}

/// Pending governance change proposal
#[cw_serde]
pub struct PendingGovernance {
    /// Proposed new governance address
    pub new_address: Addr,
    /// Block time when the change can be executed
    pub execute_after: Timestamp,
}

/// Contract name for cw2 migration info
pub const CONTRACT_NAME: &str = "crates.io:treasury";
/// Contract version for cw2 migration info
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 7 days in seconds
pub const DEFAULT_TIMELOCK_DURATION: u64 = 604_800;

/// Primary config storage
pub const CONFIG: Item<Config> = Item::new("config");

/// Pending governance proposals mapping
/// Key: Proposed new governance address as string
/// Value: PendingGovernance with execute_after timestamp
/// Multiple proposals can exist simultaneously, each with their own timelock.
pub const PENDING_GOVERNANCE: Map<&str, PendingGovernance> = Map::new("pending_governance");

/// Pending withdrawal proposal
#[cw_serde]
pub struct PendingWithdrawal {
    /// Destination address for the withdrawal
    pub destination: Addr,
    /// Asset to withdraw
    pub asset: common::AssetInfo,
    /// Amount to withdraw
    pub amount: cosmwasm_std::Uint128,
    /// Block time when the withdrawal can be executed
    pub execute_after: Timestamp,
}

/// Pending withdrawals mapping
/// Key: Unique withdrawal ID (hash of destination + asset + amount + timestamp)
/// Value: PendingWithdrawal with execute_after timestamp
/// Multiple withdrawals can exist simultaneously, each with their own timelock.
pub const PENDING_WITHDRAWALS: Map<&str, PendingWithdrawal> = Map::new("pending_withdrawals");

/// CW20 token whitelist for balance tracking
/// Key: CW20 contract address as string
pub const CW20_WHITELIST: Map<&str, bool> = Map::new("cw20_whitelist");

