//! State definitions for the Treasury contract

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Timestamp, Uint128};
use cw_storage_plus::{Item, Map};

/// Fixed tumbling window for CW20 InstantWithdraw pull limits (24 hours).
pub const CW20_PULL_LIMIT_WINDOW_SECONDS: u64 = 86_400;

/// Contract configuration
///
/// # Invariants
/// - No `swap_contract` field: treasury does **not** participate in USTC→USTR
///   product swaps. Live path is user → `ustc-swap::Swap` → `BankMsg::Send` USTC
///   to treasury. See [#8](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/8).
/// - `wrapping_paused` gates only `WrapDeposit` / native `InstantWithdraw`.
#[cw_serde]
pub struct Config {
    /// Current governance address (admin/DAO)
    pub governance: Addr,
    /// Duration of governance change delay in seconds (7 days = 604,800)
    pub timelock_duration: u64,
    /// Whether wrapping operations (WrapDeposit / InstantWithdraw) are paused
    pub wrapping_paused: bool,
}

/// Pre-#8 / pre-wrap on-disk config shape used only by `migrate`.
///
/// Loads configs that still have `swap_contract` and/or lack `wrapping_paused`.
/// The obsolete `swap_contract` value is discarded; never re-persisted.
#[cw_serde]
pub struct ConfigLegacy {
    pub governance: Addr,
    pub timelock_duration: u64,
    /// Discarded on migrate (#8 / MB-1).
    #[serde(default)]
    pub swap_contract: Option<Addr>,
    #[serde(default)]
    pub wrapping_paused: bool,
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

/// Maps native denom (e.g. "uluna", "uusd") to a trusted wrapper contract address.
/// Governance-managed. Used by WrapDeposit and InstantWithdraw.
pub const DENOM_WRAPPERS: Map<&str, Addr> = Map::new("denom_wrappers");

/// Maps CW20 token contract address → registered spender authorized for
/// `InstantWithdrawCw20` on that token only.
///
/// Storage namespace `"cw20_spenders"` is intentionally distinct from
/// `"cw20_whitelist"` (balance tracking) and `"denom_wrappers"` (native wrap).
///
/// # Invariants
/// - Only governance may set/remove entries (`SetCw20Spender` / `RemoveCw20Spender`).
/// - At most one spender per token; `SetCw20Spender` overwrites.
/// - Governance is **not** an implicit spender — registration is required.
/// - Pulls also require a per-(spender, token) 24h limit (see `CW20_PULL_LIMITS`);
///   unset / removed limit ⇒ fail-closed (deny InstantWithdrawCw20).
/// - Whitelist membership is **not** required for InstantWithdrawCw20.
pub const CW20_SPENDERS: Map<&str, Addr> = Map::new("cw20_spenders");

/// Governance-configured max cumulative InstantWithdrawCw20 amount per
/// tumbling 24h window, keyed by `(token, spender)`.
///
/// Namespace `"cw20_pull_limits"` is distinct from `cw20_spenders`,
/// `cw20_whitelist`, and wrap-mapper `rate_limits`.
///
/// # Invariants
/// - Absent entry ⇒ InstantWithdrawCw20 denied for that pair (fail-closed).
/// - `window_seconds` is always `CW20_PULL_LIMIT_WINDOW_SECONDS` (86400).
/// - Does not gate native InstantWithdraw or ProposeWithdraw / ExecuteWithdraw.
#[cw_serde]
pub struct Cw20PullLimitConfig {
    pub max_amount_per_window: Uint128,
    pub window_seconds: u64,
}

/// Tumbling-window usage for a `(token, spender)` pull-limit pair.
#[cw_serde]
pub struct Cw20PullLimitState {
    pub current_window_start: Timestamp,
    pub amount_used: Uint128,
}

/// Key: `(token_addr, spender_addr)`. Value: limit config.
pub const CW20_PULL_LIMITS: Map<(&str, &str), Cw20PullLimitConfig> =
    Map::new("cw20_pull_limits");

/// Key: `(token_addr, spender_addr)`. Value: current window usage.
pub const CW20_PULL_LIMIT_STATE: Map<(&str, &str), Cw20PullLimitState> =
    Map::new("cw20_pull_limit_state");

/// Independent pause for the CW20 InstantWithdraw pull path.
/// Distinct from `Config.wrapping_paused` so pausing wraps does not halt
/// UST1-window vFDUSD redeem. Absent key means not paused (`false`).
pub const CW20_INSTANT_WITHDRAW_PAUSED: Item<bool> = Item::new("cw20_iw_paused");

