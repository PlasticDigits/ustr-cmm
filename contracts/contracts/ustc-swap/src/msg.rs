//! Message types for the USTC Swap contract

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Decimal, Timestamp, Uint128};
use common::AssetInfo;

/// Migrate message (empty for now, can be extended for future migrations)
#[cw_serde]
pub struct MigrateMsg {}

/// Instantiate message
#[cw_serde]
pub struct InstantiateMsg {
    /// USTR contract address
    pub ustr_token: String,
    /// Treasury contract address (destination for USTC)
    pub treasury: String,
    /// Referral contract address (for code validation)
    pub referral: String,
    /// Unix epoch timestamp when swap period begins
    pub start_time: u64,
    /// Starting exchange rate (1.5)
    pub start_rate: Decimal,
    /// Ending exchange rate (2.5)
    pub end_rate: Decimal,
    /// Swap duration in seconds (defaults to 8,640,000 for 100 days if not provided)
    pub duration_seconds: Option<u64>,
    /// Admin address for emergencies
    pub admin: String,
}

/// Hint for O(1) leaderboard insertion
/// Frontend queries current leaderboard and provides the position hint
/// If hint is wrong, contract falls back to searching from the hint position
#[cw_serde]
pub struct LeaderboardHint {
    /// Code that should be immediately before us in the leaderboard (higher rewards)
    /// None means we claim to be the new head (highest rewards)
    pub insert_after: Option<String>,
}

/// Execute messages
#[cw_serde]
pub enum ExecuteMsg {
    /// User sends USTC to swap for USTR
    /// Contract forwards USTC to Treasury (0.5% burn tax applies)
    /// Mints USTR to user based on pre-tax amount
    /// If valid referral code: +10% bonus to user, +10% to referrer
    Swap {
        /// Optional referral code. If None or empty, no referral bonus.
        /// If Some but invalid/not registered, transaction fails.
        referral_code: Option<String>,
        /// Optional hint for O(1) leaderboard insertion.
        /// If None, falls back to O(n) search from tail.
        /// If wrong, searches from hint position (up or down).
        leaderboard_hint: Option<LeaderboardHint>,
    },

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

    /// Returns USTR amount for given USTC, including referral bonus if applicable
    #[returns(SimulationResponse)]
    SwapSimulation {
        ustc_amount: Uint128,
        /// Optional referral code to simulate bonus
        referral_code: Option<String>,
    },

    /// Returns active/ended status, time remaining
    #[returns(StatusResponse)]
    Status {},

    /// Returns total USTC received, total USTR minted, referral stats
    #[returns(StatsResponse)]
    Stats {},

    /// Returns pending admin proposal details
    #[returns(Option<PendingAdminResponse>)]
    PendingAdmin {},

    /// Returns reward statistics for a specific referral code
    #[returns(ReferralCodeStatsResponse)]
    ReferralCodeStats {
        /// The referral code to query (case-insensitive)
        code: String,
    },

    /// Returns paginated leaderboard of referral codes ranked by total rewards earned
    #[returns(ReferralLeaderboardResponse)]
    ReferralLeaderboard {
        /// Optional code to start after (for cursor-based pagination)
        start_after: Option<String>,
        /// Maximum number of entries to return (default: 10, max: 50)
        limit: Option<u32>,
    },
}

/// Response for Config query
#[cw_serde]
pub struct ConfigResponse {
    pub ustr_token: Addr,
    pub treasury: Addr,
    pub referral: Addr,
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
    /// USTC amount being swapped (pre-tax)
    pub ustc_amount: Uint128,
    /// Base USTR amount (without referral bonus)
    pub base_ustr_amount: Uint128,
    /// User bonus USTR (10% if referral code valid)
    pub user_bonus: Uint128,
    /// Referrer bonus USTR (10% if referral code valid)
    pub referrer_bonus: Uint128,
    /// Total USTR to user (base + user_bonus)
    pub total_ustr_to_user: Uint128,
    /// Rate used for calculation
    pub rate: Decimal,
    /// Whether referral code is valid
    pub referral_valid: bool,
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
    /// Total USTC deposited (pre-tax amounts)
    pub total_ustc_received: Uint128,
    /// Total USTR minted (including referral bonuses)
    pub total_ustr_minted: Uint128,
    /// Total USTR minted as referral bonuses (user + referrer combined)
    pub total_referral_bonus_minted: Uint128,
    /// Count of swaps that used valid referral codes
    pub total_referral_swaps: u64,
    /// Count of unique referral codes that have been used in at least one swap
    pub unique_referral_codes_used: u64,
}

/// Response for PendingAdmin query
#[cw_serde]
pub struct PendingAdminResponse {
    pub new_address: Addr,
    pub execute_after: Timestamp,
}

/// Response for ReferralCodeStats query
#[cw_serde]
pub struct ReferralCodeStatsResponse {
    /// The referral code (normalized to lowercase)
    pub code: String,
    /// Code owner address (queried from Referral contract)
    pub owner: Addr,
    /// Total USTR earned by the code owner from referrals
    pub total_rewards_earned: Uint128,
    /// Total USTR bonuses given to users who used this code
    pub total_user_bonuses: Uint128,
    /// Number of swaps that used this referral code
    pub total_swaps: u64,
}

/// Response for ReferralLeaderboard query
#[cw_serde]
pub struct ReferralLeaderboardResponse {
    /// Leaderboard entries sorted by total_rewards_earned (descending)
    pub entries: Vec<LeaderboardEntry>,
    /// Whether more entries exist after this page
    pub has_more: bool,
}

/// Single entry in the referral leaderboard
#[cw_serde]
pub struct LeaderboardEntry {
    /// The referral code
    pub code: String,
    /// Code owner address
    pub owner: Addr,
    /// Total USTR earned by the code owner from referrals
    pub total_rewards_earned: Uint128,
    /// Total USTR bonuses given to users who used this code
    pub total_user_bonuses: Uint128,
    /// Number of swaps that used this referral code
    pub total_swaps: u64,
    /// Position on the leaderboard (1-indexed)
    pub rank: u32,
}

