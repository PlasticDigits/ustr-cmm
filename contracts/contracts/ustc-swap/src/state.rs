//! State definitions for the USTC Swap contract

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Decimal, Timestamp, Uint128};
use cw_storage_plus::{Item, Map};

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
    /// Count of unique referral codes that have been used in at least one swap
    pub unique_referral_codes_used: u64,
}

/// Per-referral-code statistics for leaderboard tracking
#[cw_serde]
pub struct ReferralCodeStats {
    /// Total USTR earned by the code owner from referrals
    pub total_rewards_earned: Uint128,
    /// Total USTR bonuses given to users who used this code
    pub total_user_bonuses: Uint128,
    /// Number of swaps that used this referral code
    pub total_swaps: u64,
}

/// Linked list node for maintaining sorted leaderboard
/// Codes are sorted in descending order by total_rewards_earned
#[cw_serde]
pub struct LeaderboardLink {
    /// Previous code in sorted order (higher rewards), None if this is the head
    pub prev: Option<String>,
    /// Next code in sorted order (lower rewards), None if this is the tail
    pub next: Option<String>,
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

/// Decimal adjustment factor for USTC (6 decimals) to USTR (18 decimals) conversion
/// USTR has 18 decimals, USTC has 6 decimals, so we multiply by 10^12
/// Note: USTR decimals are validated at instantiation time; USTC decimals (6) are a
/// Terra Classic protocol constant for native tokens and cannot be queried on-chain.
pub const DECIMAL_ADJUSTMENT: u128 = 1_000_000_000_000; // 10^12

/// Referral bonus percentage (10% = 10 out of 100)
pub const REFERRAL_BONUS_NUMERATOR: u128 = 10;
pub const REFERRAL_BONUS_DENOMINATOR: u128 = 100;

/// Safety limit: max single mint cannot exceed 5% of total supply
/// This prevents catastrophic minting bugs from draining value
pub const MINT_SAFETY_LIMIT_NUMERATOR: u128 = 5;
pub const MINT_SAFETY_LIMIT_DENOMINATOR: u128 = 100;

/// Maximum number of entries in the leaderboard
/// Only the top 50 referral codes by rewards are tracked on-chain
/// This provides O(50) bounded gas costs instead of O(n) unbounded
pub const MAX_LEADERBOARD_SIZE: u32 = 50;

/// Default limit for leaderboard pagination
pub const DEFAULT_LEADERBOARD_LIMIT: u32 = 10;
/// Maximum limit for leaderboard pagination
pub const MAX_LEADERBOARD_LIMIT: u32 = 50;

/// Primary config storage
pub const CONFIG: Item<Config> = Item::new("config");

/// Pending admin proposal (if any)
pub const PENDING_ADMIN: Item<PendingAdmin> = Item::new("pending_admin");

/// Swap statistics
pub const STATS: Item<Stats> = Item::new("stats");

/// Per-referral-code statistics, keyed by normalized (lowercase) code
pub const REFERRAL_CODE_STATS: Map<&str, ReferralCodeStats> = Map::new("referral_code_stats");

/// Head of the sorted leaderboard linked list (code with highest rewards)
/// None if no referral codes have been used yet
pub const LEADERBOARD_HEAD: Item<Option<String>> = Item::new("leaderboard_head");

/// Tail of the sorted leaderboard linked list (code with lowest rewards in top 50)
/// None if no referral codes have been used yet
/// Used to efficiently check if a new code qualifies for the leaderboard
pub const LEADERBOARD_TAIL: Item<Option<String>> = Item::new("leaderboard_tail");

/// Current number of entries in the leaderboard (0 to MAX_LEADERBOARD_SIZE)
pub const LEADERBOARD_SIZE: Item<u32> = Item::new("leaderboard_size");

/// Linked list structure for O(50) bounded insertion and O(1) traversal of leaderboard
/// Keyed by normalized (lowercase) code
/// Only contains the top 50 codes by total_rewards_earned
pub const LEADERBOARD_LINKS: Map<&str, LeaderboardLink> = Map::new("leaderboard_links");

